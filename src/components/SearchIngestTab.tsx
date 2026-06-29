import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, AlertCircle, Gavel, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  previewSearchUrl,
  ingestSearchProperty,
  getSearchIngestSettings,
} from "@/lib/search-ingest.functions";
import { cleanListingUrl } from "@/lib/listing-url";

type ItemState = "pending" | "in-progress" | "added" | "skipped" | "failed";

/** Search-URL ingest flow — paste a Rightmove search URL, preview the properties on the
 *  page, tick the ones to add, then bulk-ingest with a per-item progress line and the
 *  admin-controlled throttle delay between calls. */
export function SearchIngestTab({
  onDone,
  controlledUrl,
  hideUrlInput = false,
  autoPreview = false,
}: {
  onDone: () => void;
  /** When set, this URL is used instead of the internal input — lets the parent (URL tab)
   *  drive the search flow from a unified field. */
  controlledUrl?: string;
  /** Hide the built-in input row when the parent already shows one. */
  hideUrlInput?: boolean;
  /** Kick off the preview as soon as a valid search URL is set. */
  autoPreview?: boolean;
}) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewSearchUrl);
  const ingestFn = useServerFn(ingestSearchProperty);

  const [searchUrl, setSearchUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<
    Record<string, { state: ItemState; message?: string }>
  >({});
  const [running, setRunning] = useState(false);

  const settings = useQuery({
    queryKey: ["search-ingest-settings"],
    queryFn: () => getSearchIngestSettings(),
  });

  const previewMut = useMutation({
    mutationFn: async (url: string) => {
      const cleaned = cleanListingUrl(url);
      if (cleaned.kind !== "search") {
        throw new Error("Paste a search results URL (e.g. Rightmove /property-for-sale/find.html?…).");
      }
      if (cleaned.host !== "rightmove") {
        throw new Error(`Search ingest is currently only tested for Rightmove. ${cleaned.host} search pages aren't supported yet — open a single listing instead.`);
      }
      return previewFn({ data: { url: cleaned.url } });
    },
    onSuccess: (r) => {
      setSelected(new Set(r.items.map((i) => i.id)));
      setProgress({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  // When the parent drives the URL, mirror it locally and optionally auto-preview.
  const effectiveUrl = controlledUrl ?? searchUrl;
  // Auto-fire preview when controlledUrl changes to a fresh, valid search URL.
  const lastAutoUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPreview || !controlledUrl) return;
    if (lastAutoUrl.current === controlledUrl) return;
    try {
      const c = cleanListingUrl(controlledUrl);
      if (c.kind === "search" && c.host === "rightmove") {
        lastAutoUrl.current = controlledUrl;
        previewMut.mutate(controlledUrl);
      }
    } catch {
      /* ignore — parent shows validation */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledUrl, autoPreview]);

  const items = previewMut.data?.items ?? [];
  const maxBatch = settings.data?.max_per_batch ?? 10;
  const allowAll = settings.data?.allow_all ?? false;
  const throttle = settings.data?.throttle_ms ?? 2500;
  const effectiveCap = allowAll ? Number.POSITIVE_INFINITY : maxBatch;
  const selectedCount = selected.size;
  const overCap = selectedCount > effectiveCap;

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const validateUrl = (v: string) => {
    setSearchUrl(v);
    if (!v.trim()) { setUrlError(null); return; }
    try {
      const c = cleanListingUrl(v);
      if (c.host !== "rightmove") setUrlError("Only Rightmove search URLs are supported right now.");
      else if (c.kind !== "search") setUrlError("That's a single property URL — use the URL tab instead.");
      else setUrlError(null);
    } catch (e: any) {
      setUrlError(e.message);
    }
  };

  const runBatch = async () => {
    const queue = items.filter((i) => selected.has(i.id));
    if (!queue.length) return;
    if (overCap) {
      toast.error(`Admin limit is ${maxBatch} per batch. Untick some properties or ask an admin to enable bulk mode.`);
      return;
    }
    setRunning(true);
    setProgress(Object.fromEntries(queue.map((q) => [q.id, { state: "pending" as ItemState }])));
    let added = 0;
    let skipped = 0;
    let failed = 0;
    for (let idx = 0; idx < queue.length; idx++) {
      const it = queue[idx];
      setProgress((p) => ({ ...p, [it.id]: { state: "in-progress" } }));
      try {
        const r = await ingestFn({ data: { item: it } });
        if (r.skipped) {
          skipped++;
          setProgress((p) => ({ ...p, [it.id]: { state: "skipped", message: "Already in your library" } }));
        } else {
          added++;
          setProgress((p) => ({ ...p, [it.id]: { state: "added" } }));
        }
      } catch (e: any) {
        failed++;
        setProgress((p) => ({ ...p, [it.id]: { state: "failed", message: e.message } }));
      }
      if (idx < queue.length - 1) await new Promise((r) => setTimeout(r, throttle));
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["properties"] });
    toast.success(`Added ${added}${skipped ? `, skipped ${skipped}` : ""}${failed ? `, failed ${failed}` : ""}`);
    if (failed === 0) onDone();
  };

  const completed = Object.values(progress).filter((p) =>
    ["added", "skipped", "failed"].includes(p.state),
  ).length;
  const totalRunning = Object.keys(progress).length;
  const percent = totalRunning ? (completed / totalRunning) * 100 : 0;

  return (
    <div className="space-y-4 pt-2">
      {!hideUrlInput && <p className="text-sm text-muted-foreground">
        Paste a Rightmove search URL (e.g. <code className="rounded bg-muted px-1 text-xs">/property-for-sale/find.html?...</code>).
        The page is fetched directly — no Firecrawl credits spent — and you can pick which
        properties to add. Each insert is throttled to keep Rightmove happy.
      </p>}
      {!hideUrlInput && <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="https://www.rightmove.co.uk/property-for-sale/find.html?…"
          value={searchUrl}
          onChange={(e) => validateUrl(e.target.value)}
        />
        <Button
          disabled={!searchUrl || !!urlError || previewMut.isPending}
          onClick={() => previewMut.mutate(searchUrl)}
        >
          {previewMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Preview
        </Button>
      </div>}
      {hideUrlInput && controlledUrl && !previewMut.data && (
        <div className="flex items-center gap-2">
          <Button
            disabled={!controlledUrl || previewMut.isPending}
            onClick={() => previewMut.mutate(controlledUrl)}
          >
            {previewMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Preview properties on this search
          </Button>
        </div>
      )}
      {!hideUrlInput && urlError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{urlError}</span>
        </div>
      )}

      {previewMut.data && (
        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <span className="font-semibold">{items.length}</span> properties on this page
              {previewMut.data.location ? ` · ${previewMut.data.location}` : ""}
              {previewMut.data.total > items.length ? ` (of ~${previewMut.data.total} total)` : ""}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <button type="button" className="underline" onClick={toggleAll}>
                {selected.size === items.length ? "Clear all" : "Select all"}
              </button>
              <span>· Admin cap: {allowAll ? "unlimited" : `${maxBatch}/batch`}</span>
              <span>· Throttle: {(throttle / 1000).toFixed(1)}s</span>
            </div>
          </div>

          {overCap && (
            <div className="rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              You've selected {selectedCount} but the admin cap is {maxBatch}. Untick some to continue.
            </div>
          )}

          <div className="max-h-[40vh] space-y-1.5 overflow-y-auto">
            {items.map((it) => {
              const p = progress[it.id];
              return (
                <div key={it.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
                  <Checkbox
                    checked={selected.has(it.id)}
                    onCheckedChange={() => toggleOne(it.id)}
                    disabled={running}
                  />
                  {it.image_urls[0] && (
                    <img src={it.image_urls[0]} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="truncate font-medium">{it.address}</span>
                      {it.is_auction && (
                        <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                          <Gavel className="mr-0.5 h-2.5 w-2.5" />Auction
                        </Badge>
                      )}
                      {it.is_development && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          <Building2 className="mr-0.5 h-2.5 w-2.5" />Development
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {it.asking_price_gbp ? `£${it.asking_price_gbp.toLocaleString()}` : "POA"}
                      {it.price_qualifier ? ` (${it.price_qualifier})` : ""}
                      {it.beds != null ? ` · ${it.beds} bed` : ""}
                      {it.baths != null ? ` · ${it.baths} bath` : ""}
                      {it.property_type ? ` · ${it.property_type}` : ""}
                      {it.agent_name ? ` · ${it.agent_name}` : ""}
                    </div>
                  </div>
                  <ItemStatus state={p?.state} message={p?.message} />
                </div>
              );
            })}
          </div>

          {totalRunning > 0 && (
            <div className="space-y-1">
              <Progress value={percent} />
              <div className="text-right text-xs text-muted-foreground">
                {completed} / {totalRunning} processed
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {selectedCount} selected
              {selectedCount > 1 ? ` · ~${Math.ceil((selectedCount * throttle) / 1000)}s with throttle` : ""}
            </div>
            <Button onClick={runBatch} disabled={running || !selectedCount || overCap}>
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add {selectedCount || ""} {selectedCount === 1 ? "property" : "properties"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemStatus({ state, message }: { state?: ItemState; message?: string }) {
  if (!state) return null;
  if (state === "in-progress")
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Extracting…">
        <Loader2 className="h-3 w-3 animate-spin" /> Adding…
      </span>
    );
  if (state === "added") return <span className="text-xs font-medium text-emerald-600">Added</span>;
  if (state === "skipped")
    return <span className="text-xs text-muted-foreground" title={message}>Already in library</span>;
  if (state === "failed")
    return <span className="text-xs font-medium text-destructive" title={message}>Failed</span>;
  return <span className="text-xs text-muted-foreground">Pending…</span>;
}