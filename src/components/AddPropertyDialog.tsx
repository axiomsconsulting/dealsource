import { useRouter } from "@tanstack/react-router";
import { useState, useRef, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { bulkIngestProperties, ingestFromUrl } from "@/lib/ingest.functions";
import { parsePropertyFilterCsv } from "@/lib/parsers/csv";
import { parsePropertyFilterJson, type ParsedJsonProperty } from "@/lib/parsers/json";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileJson, ClipboardPaste, FileSpreadsheet, Link2, Loader2, ChevronDown, ChevronUp, AlertCircle, Image as ImageIcon, Search } from "lucide-react";
import { SearchIngestTab } from "@/components/SearchIngestTab";
import { cleanListingUrl } from "@/lib/listing-url";

/** Splits concatenated JSON objects/array text into individual raw objects — same tolerant
 *  parsing `jsonMut` uses for ingestion, reused here so the live preview matches what submit does. */
function splitJsonObjects(text: string): any[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed.split(/}\s*\n\s*{/).map((s, i, arr) => {
      let chunk = s;
      if (i > 0) chunk = "{" + chunk;
      if (i < arr.length - 1) chunk = chunk + "}";
      return JSON.parse(chunk);
    });
  }
}

const PARSED_KEYS = new Set(["propertyLight", "propertyDetail", "selectedList"]);

/** Live, instant validation preview for pasted JSON — parses each object and summarises the
 *  fields the importer will pick up, plus any unrecognised top-level keys. Throws (caught by
 *  caller) on malformed JSON so the UI can show an inline error. */
function previewJson(text: string): { item: ParsedJsonProperty; extraKeys: string[] }[] {
  const objs = splitJsonObjects(text);
  return objs.map((obj) => {
    const item = parsePropertyFilterJson(obj);
    if (!item) throw new Error("Not a recognised Property Filter JSON (missing propertyLight.address)");
    const extraKeys = Object.keys(obj).filter((k) => !PARSED_KEYS.has(k));
    return { item, extraKeys };
  });
}

/** Modal "Add property" flow — CSV / JSON / URL / Manual, in one place so it can be triggered
 *  from the nav and from the properties page without navigating away from what you're doing. */
export function AddPropertyDialog({ trigger, defaultTab = "json" }: { trigger: ReactNode; defaultTab?: "csv" | "json" | "url" | "search" | "manual" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const ingest = useServerFn(bulkIngestProperties);
  const ingestUrl = useServerFn(ingestFromUrl);

  const [csvText, setCsvText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [listingUrlError, setListingUrlError] = useState<string | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [jsonPreview, setJsonPreview] = useState<{ item: ParsedJsonProperty; extraKeys: string[] }[] | null>(null);
  const [jsonPreviewError, setJsonPreviewError] = useState<string | null>(null);

  const runJsonPreview = (text: string) => {
    if (!text.trim()) {
      setJsonPreview(null);
      setJsonPreviewError(null);
      return;
    }
    try {
      setJsonPreview(previewJson(text));
      setJsonPreviewError(null);
    } catch (e: any) {
      setJsonPreview(null);
      setJsonPreviewError(e.message || "Couldn't parse this as Property Filter JSON");
    }
  };

  const onJsonPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    const merged = jsonText ? `${jsonText}\n${pasted}` : pasted;
    runJsonPreview(merged);
  };

  const csvMut = useMutation({
    mutationFn: async (text: string) => {
      const rows = parsePropertyFilterCsv(text);
      if (!rows.length) throw new Error("No rows found in CSV");
      const items = rows.map((r) => ({ ...r, source: "property_filter_csv" }));
      return ingest({ data: { items } });
    },
    onSuccess: (r) => {
      toast.success(`Ingested ${r.inserted.length} properties`);
      qc.invalidateQueries({ queryKey: ["properties"] });
      setCsvText("");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const jsonMut = useMutation({
    mutationFn: async (text: string) => {
      // Allow concatenated JSON objects or array
      const trimmed = text.trim();
      let inputs: any[] = [];
      try {
        const parsed = JSON.parse(trimmed);
        inputs = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // try splitting on }\n{
        inputs = trimmed.split(/}\s*\n\s*{/).map((s, i, arr) => {
          let chunk = s;
          if (i > 0) chunk = "{" + chunk;
          if (i < arr.length - 1) chunk = chunk + "}";
          return JSON.parse(chunk);
        });
      }
      const parsedItems = inputs.map(parsePropertyFilterJson).filter(Boolean) as ReturnType<typeof parsePropertyFilterJson>[];
      if (!parsedItems.length) throw new Error("No valid Property Filter JSON detected");
      const items = parsedItems.map((p) => ({ ...(p as any), source: "property_filter_json" }));
      return ingest({ data: { items } });
    },
    onSuccess: (r) => {
      toast.success(`Ingested ${r.inserted.length} properties`);
      qc.invalidateQueries({ queryKey: ["properties"] });
      setJsonText("");
      setJsonPreview(null);
      setJsonPreviewError(null);
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const urlMut = useMutation({
    mutationFn: (url: string) => {
      // Client-side validation BEFORE the server call so we don't spend a Firecrawl
      // request on a malformed link.
      const cleaned = cleanListingUrl(url);
      if (cleaned.kind === "search") {
        throw new Error("That's a search results URL. Switch to the Search tab to pick properties from it.");
      }
      if (cleaned.kind !== "property") {
        throw new Error("Open the listing on the property site and paste the address-bar URL.");
      }
      return ingestUrl({ data: { url: cleaned.url } });
    },
    onSuccess: (r) => {
      toast.success(`Ingested "${r.property.address}" from listing`);
      qc.invalidateQueries({ queryKey: ["properties"] });
      setListingUrl("");
      setOpen(false);
      // Hard-reload into the new property detail — guarantees the Supabase bearer
      // is attached for getProperty's first call (a soft SPA navigate has occasionally
      // raced the auth header and surfaced as "Not Found" for the freshly-inserted row).
      if (typeof window !== "undefined") {
        window.location.assign(`/properties/${r.property.id}`);
      } else {
        router.navigate({ to: "/properties/$id", params: { id: r.property.id } });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const validateListingUrl = (v: string) => {
    setListingUrl(v);
    if (!v.trim()) { setListingUrlError(null); return; }
    try {
      const c = cleanListingUrl(v);
      if (c.host === "unknown") setListingUrlError("Must be a Rightmove, Zoopla, OnTheMarket, Boomin or PrimeLocation link.");
      else if (c.kind === "search") setListingUrlError("That's a search results URL — use the Search tab.");
      else if (c.kind !== "property") setListingUrlError("That doesn't look like a single property listing URL.");
      else setListingUrlError(null);
    } catch (e: any) { setListingUrlError(e.message); }
  };

  const onCsvFile = async (f: File) => {
    const text = await f.text();
    csvMut.mutate(text);
  };
  const onJsonFiles = async (files: FileList) => {
    const texts = await Promise.all(Array.from(files).map((f) => f.text()));
    const joined = texts.join("\n");
    setJsonText(joined);
    runJsonPreview(joined);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-2xl"
        onOpenAutoFocus={(e) => {
          if (defaultTab === "json") {
            e.preventDefault();
            jsonTextareaRef.current?.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Add property</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Upload a Property Filter CSV export, paste/upload one or many JSON details, ingest a listing URL, or add manually.
          Each property is analysed against your active investment profile automatically.
        </p>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="csv"><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</TabsTrigger>
            <TabsTrigger value="json"><FileJson className="mr-2 h-4 w-4" />JSON</TabsTrigger>
            <TabsTrigger value="url"><Link2 className="mr-2 h-4 w-4" />URL</TabsTrigger>
            <TabsTrigger value="search"><Search className="mr-2 h-4 w-4" />Search</TabsTrigger>
            <TabsTrigger value="manual"><ClipboardPaste className="mr-2 h-4 w-4" />Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-4 pt-4">
            <div
              onClick={() => csvFileRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed bg-muted/30 p-8 text-center hover:bg-muted/50"
            >
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drop or click to upload Property Filter CSV</p>
              <p className="text-xs text-muted-foreground">Recognises ForSale, EPC, beds, area, agent, link columns.</p>
              <input
                type="file"
                accept=".csv"
                hidden
                ref={csvFileRef}
                onChange={(e) => e.target.files?.[0] && onCsvFile(e.target.files[0])}
              />
            </div>
            <div className="text-center text-xs text-muted-foreground">— or paste CSV —</div>
            <Textarea rows={6} placeholder="Paste CSV content here…" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
            <Button className="w-full" disabled={!csvText || csvMut.isPending} onClick={() => csvMut.mutate(csvText)}>
              {csvMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ingest CSV
            </Button>
          </TabsContent>

          <TabsContent value="json" className="space-y-4 pt-4">
            <div
              onClick={() => jsonFileRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed bg-muted/30 p-8 text-center hover:bg-muted/50"
            >
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drop or click to upload JSON file(s)</p>
              <p className="text-xs text-muted-foreground">Property Filter detail JSON, one or many.</p>
              <input
                type="file"
                accept=".json,application/json"
                multiple
                hidden
                ref={jsonFileRef}
                onChange={(e) => e.target.files && onJsonFiles(e.target.files)}
              />
            </div>
            <div className="text-center text-xs text-muted-foreground">— or paste JSON —</div>
            <Textarea
              ref={jsonTextareaRef}
              autoFocus={defaultTab === "json"}
              rows={jsonPreview || jsonPreviewError ? 4 : 10}
              placeholder='Paste {"propertyLight":...} or [{...},{...}]'
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); runJsonPreview(e.target.value); }}
              onPaste={onJsonPaste}
            />
            {jsonPreviewError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{jsonPreviewError}</span>
              </div>
            )}
            {jsonPreview && <JsonPreviewTree items={jsonPreview} />}
            <Button className="w-full" disabled={!jsonText || jsonMut.isPending} onClick={() => jsonMut.mutate(jsonText)}>
              {jsonMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ingest JSON
            </Button>
          </TabsContent>

          <TabsContent value="url" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Paste a Rightmove, Zoopla, OnTheMarket, Boomin or PrimeLocation listing link — Firecrawl scrapes the
              page and a property card is created automatically. You can layer on a Property Filter JSON later from
              the property page to enrich it further as more data comes in.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="https://www.rightmove.co.uk/properties/…"
                value={listingUrl}
                onChange={(e) => validateListingUrl(e.target.value)}
              />
              <Button className="w-full sm:w-auto" disabled={!listingUrl || !!listingUrlError || urlMut.isPending} onClick={() => urlMut.mutate(listingUrl)}>
                {urlMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                Ingest from URL
              </Button>
            </div>
            {listingUrlError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{listingUrlError}</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="search">
            <SearchIngestTab onDone={() => setOpen(false)} />
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 pt-4">
            <ManualForm onDone={() => { qc.invalidateQueries({ queryKey: ["properties"] }); setOpen(false); }} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ManualForm({ onDone }: { onDone: () => void }) {
  const ingest = useServerFn(bulkIngestProperties);
  const [form, setForm] = useState({
    address: "", postcode: "", beds: "3", property_type: "Terraced house",
    epc_rate: "C", asking_price_gbp: "180000", source_link: "",
  });
  const mut = useMutation({
    mutationFn: async () =>
      ingest({
        data: {
          items: [
            {
              address: form.address,
              postcode: form.postcode || null,
              beds: form.beds ? parseInt(form.beds) : null,
              property_type: form.property_type || null,
              epc_rate: form.epc_rate || null,
              asking_price_gbp: form.asking_price_gbp ? parseFloat(form.asking_price_gbp) : null,
              source_link: form.source_link || null,
              source: "manual",
            },
          ],
        },
      }),
    onSuccess: () => {
      toast.success("Property added");
      onDone();
      setForm({ ...form, address: "", source_link: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label>Address *</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      <div><Label>Postcode</Label><Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} /></div>
      <div><Label>Beds</Label><Input type="number" value={form.beds} onChange={(e) => setForm({ ...form, beds: e.target.value })} /></div>
      <div><Label>Type</Label><Input value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })} /></div>
      <div><Label>EPC</Label><Input value={form.epc_rate} onChange={(e) => setForm({ ...form, epc_rate: e.target.value })} /></div>
      <div><Label>Asking price £</Label><Input type="number" value={form.asking_price_gbp} onChange={(e) => setForm({ ...form, asking_price_gbp: e.target.value })} /></div>
      <div className="sm:col-span-2"><Label>Listing URL</Label><Input value={form.source_link} onChange={(e) => setForm({ ...form, source_link: e.target.value })} /></div>
      <div className="sm:col-span-2">
        <Button className="w-full" disabled={!form.address || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add property
        </Button>
      </div>
    </div>
  );
}

/** Instant tree-structure summary of pasted/uploaded JSON — one expandable block per property,
 *  showing the key details the importer will use plus any unrecognised top-level keys. */
function JsonPreviewTree({ items }: { items: { item: ParsedJsonProperty; extraKeys: string[] }[] }) {
  const [openIdx, setOpenIdx] = useState<Set<number>>(new Set([0]));
  const toggle = (i: number) => setOpenIdx((s) => {
    const next = new Set(s);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {items.length === 1 ? "1 property detected" : `${items.length} properties detected`}
      </p>
      {items.map(({ item }, i) => {
        const open = openIdx.has(i);
        return (
          <div key={i} className="rounded-md border bg-background">
            <button
              type="button"
              onClick={() => toggle(i)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
            >
              <span className="truncate font-medium">{item.address}</span>
              {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
            {open && (
              <div className="space-y-1.5 border-t px-3 py-2 text-xs">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                  <PreviewField label="Postcode" value={item.postcode} />
                  <PreviewField label="Asking price" value={item.asking_price_gbp ? `£${item.asking_price_gbp.toLocaleString()}` : null} />
                  <PreviewField label="Type" value={item.property_type} />
                  <PreviewField label="Beds / baths" value={item.beds != null ? `${item.beds} bed${item.baths != null ? ` / ${item.baths} bath` : ""}` : null} />
                  <PreviewField label="EPC" value={item.epc_rate} />
                  <PreviewField label="Tenure" value={item.tenure} />
                  <PreviewField label="Area" value={item.area_sqm ? `${item.area_sqm} m²` : null} />
                  <PreviewField label="Rent estimate" value={item.estimated_rent_pcm ? `£${item.estimated_rent_pcm.toLocaleString()} pcm` : null} />
                  <PreviewField label="Lease remaining" value={item.lease_years_remaining ? `${item.lease_years_remaining} yrs` : null} />
                </div>
                <div className="flex items-center gap-1.5 pt-1 text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {item.image_urls.length} photo{item.image_urls.length === 1 ? "" : "s"}
                  {item.market_data?.soldComparables.length ? ` · ${item.market_data.soldComparables.length} sold comparable(s)` : ""}
                  {item.epc_from_json ? " · EPC data in JSON" : ""}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
