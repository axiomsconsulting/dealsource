import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import {
  AlertTriangle,
  Flame,
  KeyRound,
  Loader2,
  PencilLine,
  RefreshCw,
  Settings,
  Sparkles,
  Wrench,
} from "lucide-react";
import { estimateRefurb, type RefurbTier } from "@/lib/analysis/refurb";
import {
  buildEpcRoadmap,
  buildEpcMeasureCandidates,
  resolveEpcMeasureSelection,
  deriveAiEpcCategories,
} from "@/lib/analysis/epc-plan";
import {
  fetchEpcForProperty,
  selectEpcCertificate,
  getEpcForProperty,
  getEpcCredentialsStatus,
  saveEpcCredentials,
  clearEpcCredentials,
  EPC_BANDS,
  bandForScore,
} from "@/lib/epc.functions";
import { analysePhotosForRefurb } from "@/lib/ai.functions";
import { updateProperty } from "@/lib/ingest.functions";
import { fmtGBP } from "@/lib/format";
import { toast } from "sonner";

type LineChoice = { include: boolean; tier: "low" | "mid" | "high" };

// Certificates fetched before the bilingual-description fix may still have `description` cached
// as `{ value, language }` (Welsh certificates shape it that way) — coerce defensively so a stale
// row can't crash the page; React refuses to render a bare object as a child.
function descriptionText(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && typeof (raw as any).value === "string") return (raw as any).value;
  return null;
}

const EFF_LABEL_COLOR: Record<string, string> = {
  "very good": "text-emerald-700 bg-emerald-50 border-emerald-200",
  good: "text-green-700 bg-green-50 border-green-200",
  average: "text-amber-700 bg-amber-50 border-amber-200",
  poor: "text-orange-700 bg-orange-50 border-orange-200",
  "very poor": "text-red-700 bg-red-50 border-red-200",
};

export function RefurbEpcPanel({
  propertyId,
  property,
  hasAnyPhotos,
  onLiveChange,
}: {
  propertyId: string;
  property: any;
  hasAnyPhotos: boolean;
  onLiveChange?: (estimate: any) => void;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateProperty);
  const updateProp = update;

  // ---- Refurb estimator ----
  const initialTier: RefurbTier = property?.refurb_estimate?.tier ?? "medium";
  const [tier, setTier] = useState<RefurbTier>(initialTier);
  const aiItems = useMemo(
    () => property?.ai_payload?.refurb?.items ?? property?.ai_payload?.condition?.items ?? [],
    [property?.ai_payload?.refurb?.items, property?.ai_payload?.condition?.items],
  );
  const condition = property?.ai_payload?.condition;

  // ---- EPC data ----
  const getEpc = useServerFn(getEpcForProperty);
  const fetchEpc = useServerFn(fetchEpcForProperty);
  const selectCert = useServerFn(selectEpcCertificate);

  const q = useQuery({
    queryKey: ["epc", propertyId],
    queryFn: () => getEpc({ data: { propertyId } }),
  });
  const epc: any = (q.data as any)?.epc_data ?? null;
  const fetchedAt: string | null = (q.data as any)?.epc_fetched_at ?? null;

  const getCredsStatus = useServerFn(getEpcCredentialsStatus);
  const credQ = useQuery({
    queryKey: ["epc-credentials"],
    queryFn: () => getCredsStatus({ data: {} } as any),
  });
  const configured = !!(credQ.data as any)?.configured;

  const [candidates, setCandidates] = useState<any[] | null>(null);
  const [searchedPostcode, setSearchedPostcode] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => fetchEpc({ data: { propertyId } }),
    onSuccess: (r: any) => {
      if (r.status === "matched") {
        toast.success("EPC certificate matched and fetched from the register");
        setCandidates(null);
        qc.invalidateQueries({ queryKey: ["epc", propertyId] });
      } else if (r.status === "ambiguous") {
        setCandidates(r.candidates);
        setSearchedPostcode(r.searchedPostcode);
        toast.message(
          "Couldn't confirm a single exact address match — pick the right certificate below",
        );
      } else {
        setCandidates(null);
        toast.error(`No EPC certificates found on the register for postcode ${r.searchedPostcode}`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectMut = useMutation({
    mutationFn: (certificateNumber: string) =>
      selectCert({ data: { propertyId, certificateNumber } }),
    onSuccess: () => {
      toast.success("Certificate saved to this property");
      setCandidates(null);
      qc.invalidateQueries({ queryKey: ["epc", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const roadmap = useMemo(() => (epc ? buildEpcRoadmap(epc) : null), [epc]);
  const aiCategories = useMemo(
    () => deriveAiEpcCategories(property?.ai_payload),
    [property?.ai_payload],
  );
  const epcMeasureCandidates = useMemo(
    () => (roadmap ? buildEpcMeasureCandidates(roadmap, aiCategories) : []),
    [roadmap, aiCategories],
  );
  const [overrides, setOverrides] = useState<Record<number, boolean>>(
    () => property?.refurb_estimate?.epcMeasures ?? {},
  );
  useEffect(() => {
    // Resync only when switching to a different property, not on every render —
    // `property.refurb_estimate.epcMeasures` becomes a new object reference each time
    // `nextEstimate` round-trips through the parent's draft overlay, which would otherwise
    // ping-pong `overrides` between equal-but-distinct `{}` references forever (loop).
    setOverrides(property?.refurb_estimate?.epcMeasures ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);
  const { selected, totals: epcTotals } = useMemo(
    () => resolveEpcMeasureSelection(epcMeasureCandidates, overrides),
    [epcMeasureCandidates, overrides],
  );

  const epcSelection = useMemo(() => {
    if (!epc) return null;
    const r = buildEpcRoadmap(epc);
    if (!r) return null;
    const candidates = buildEpcMeasureCandidates(r, aiCategories);
    return resolveEpcMeasureSelection(candidates, overrides).totals;
  }, [epc, aiCategories, overrides]);

  const est = useMemo(
    () => estimateRefurb(property, tier, aiItems, epcSelection),
    // estimateRefurb only reads postcode/beds/baths/area_sqm/epc_rate — depend on those instead
    // of `property` itself, which is a new object on every draftRefurb update (parent's
    // effectiveProperty merge), and would otherwise loop: est -> nextEstimate -> onLiveChange ->
    // draftRefurb -> new `property` -> est ...
    [
      property?.postcode,
      property?.beds,
      property?.baths,
      property?.area_sqm,
      property?.epc_rate,
      tier,
      aiItems,
      epcSelection,
    ],
  );

  // user choices keyed by line index
  const stored = property?.refurb_estimate?.user_overrides as
    | Record<string, LineChoice>
    | undefined;
  const [choices, setChoices] = useState<Record<string, LineChoice>>(() => stored ?? {});
  // Severity hints from a property-viewing AI analysis (e.g. "damp" noted as severe) — applied
  // once to set a sensible default tier for the matching line, without overriding anything the
  // user has already chosen.
  const severityHints = property?.refurb_estimate?.severityHints as
    | Record<string, "low" | "mid" | "high">
    | undefined;

  // when est changes (tier switch), ensure every line has a choice entry
  useEffect(() => {
    setChoices((prev) => {
      let added = false;
      const next = { ...prev };
      est.lines.forEach((l, i) => {
        const k = `${l.category}:${i}`;
        if (!next[k]) {
          const hint = severityHints?.[l.category];
          next[k] = { include: true, tier: hint ?? "mid" };
          added = true;
        }
      });
      return added ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est]);

  const live = useMemo(() => {
    let sum = 0;
    const rows = est.lines.map((l, i) => {
      const k = `${l.category}:${i}`;
      const c = choices[k] ?? { include: true, tier: "mid" as const };
      const v = c.tier === "low" ? l.low : c.tier === "high" ? l.high : l.mid;
      if (c.include) sum += v;
      return { l, k, c, value: v };
    });
    const contingency = Math.round(sum * 0.1);
    const total = sum + contingency;
    return { rows, subtotal: sum, contingency, total };
  }, [choices, est]);

  const nextEstimate = useMemo(
    () => ({
      ...est,
      tier,
      user_overrides: choices,
      total: live.total,
      totalMid: live.subtotal,
      contingency: live.contingency,
      epcMeasures: overrides,
    }),
    [est, tier, choices, live, overrides],
  );

  // Live-tied: every change (line items, tier, EPC measures) ripples into the offer plan
  // immediately via onLiveChange, with a debounced background save so it survives a reload
  // without needing a "Save" click.
  useEffect(() => {
    onLiveChange?.(nextEstimate);
  }, [nextEstimate, onLiveChange]);

  const saveMut = useMutation({
    mutationFn: (estimate: any) =>
      update({ data: { id: property.id, patch: { refurb_estimate: estimate as any } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property", property.id] }),
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    const t = setTimeout(() => saveMut.mutate(nextEstimate), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextEstimate]);

  // ---- Analyse photos -> refurb (moved from PhotosPanel) ----
  const runPhotoRefurb = useServerFn(analysePhotosForRefurb);
  const refurbMut = useMutation({
    mutationFn: () => runPhotoRefurb({ data: { propertyId } }),
    onSuccess: (r: any) => {
      toast.success(`Found ${r.items?.length ?? 0} refurb items — populated estimator`);
      qc.invalidateQueries({ queryKey: ["ai", propertyId] });
      qc.invalidateQueries({ queryKey: ["property", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ---- Guardrail (g): listing epc_rate vs register currentRating mismatch ----
  const listingRate = (property?.epc_rate || "").toUpperCase() || null;
  const registerRate = epc?.currentRating ? String(epc.currentRating).toUpperCase() : null;
  const bandOverridden = !!epc?.bandOverridden;
  const showMismatch =
    !!listingRate && !!registerRate && listingRate !== registerRate && !bandOverridden;

  const resolveMismatchMut = useMutation({
    mutationFn: (patch: { epc_rate?: string; epc_data?: any }) =>
      updateProp({ data: { id: propertyId, patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property", propertyId] });
      qc.invalidateQueries({ queryKey: ["epc", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ---- Manual EPC entry (f) ----
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBand, setManualBand] = useState(property?.epc_rate ?? "");
  const [manualScore, setManualScore] = useState("");
  const manualMut = useMutation({
    mutationFn: () =>
      updateProp({
        data: {
          id: propertyId,
          patch: {
            epc_rate: manualBand || null,
            epc_data: {
              currentRating: manualBand || null,
              currentScore: manualScore ? Number(manualScore) : null,
              source: "manual",
              enteredAt: new Date().toISOString(),
            } as any,
          },
        },
      }),
    onSuccess: () => {
      toast.success("EPC entry saved");
      setManualOpen(false);
      qc.invalidateQueries({ queryKey: ["property", propertyId] });
      qc.invalidateQueries({ queryKey: ["epc", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {aiItems.length > 0 && (
            <Badge className="bg-accent text-accent-foreground">
              <Sparkles className="mr-1 h-3 w-3" />
              AI augmented
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{est.notes.join(" · ")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasAnyPhotos || refurbMut.isPending}
            onClick={() => refurbMut.mutate()}
            title="Vision-only refurb pass — populates the estimator from photos"
          >
            {refurbMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            AI Refurb
          </Button>
          <span className="text-xs text-muted-foreground">
            {saveMut.isPending ? "Saving…" : "Saved"}
          </span>
        </div>
      </div>

      {/* Refurb tier selector — full width on mobile, matches filter pill style */}
      <ToggleGroup
        type="single"
        value={tier}
        onValueChange={(v) => v && setTier(v as RefurbTier)}
        className="w-full rounded-md border sm:w-auto"
      >
        <ToggleGroupItem
          value="light"
          className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:flex-none"
        >
          Light
        </ToggleGroupItem>
        <ToggleGroupItem
          value="medium"
          className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:flex-none"
        >
          Medium
        </ToggleGroupItem>
        <ToggleGroupItem
          value="heavy"
          className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:flex-none"
        >
          Heavy
        </ToggleGroupItem>
        <ToggleGroupItem
          value="full_gut"
          className="flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:flex-none"
        >
          Full
        </ToggleGroupItem>
      </ToggleGroup>

      {condition?.summary && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-2.5 text-sm">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">AI condition scan</span>
            {condition.score != null && <> ({condition.score}/10)</>}: {condition.summary}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Selected" v={fmtGBP(live.subtotal)} />
        <Stat label="Contingency (+10%)" v={fmtGBP(live.contingency)} />
      </div>

      <div className="space-y-2">
        {live.rows.map(({ l, k, c, value }, i) => {
          // Cycle order: excluded(−) → low(L) → mid(M) → high(H) → excluded
          const cycleIdx = !c.include ? 0 : c.tier === "low" ? 1 : c.tier === "high" ? 3 : 2;
          const CYCLE = [
            { label: "−", cls: "bg-muted text-muted-foreground border-border" },
            { label: "L", cls: "bg-sky-50 text-sky-700 border-sky-300" },
            { label: "M", cls: "bg-amber-50 text-amber-700 border-amber-300" },
            { label: "H", cls: "bg-red-50 text-red-700 border-red-300" },
          ] as const;
          const cycleNext = () => {
            const nextIdx = (cycleIdx + 1) % 4;
            if (nextIdx === 0) {
              setChoices({ ...choices, [k]: { ...c, include: false } });
            } else {
              const tier = (["low", "low", "mid", "high"] as const)[nextIdx];
              setChoices({ ...choices, [k]: { ...c, include: true, tier } });
            }
          };
          const badge = CYCLE[cycleIdx];
          return (
            <CollapsibleCard
              key={i}
              variant="plain"
              defaultOpen={false}
              title={l.label}
              summary={c.include ? fmtGBP(value) : "Excluded"}
              className={!c.include ? "opacity-50" : ""}
              actions={
                <div className="flex items-center gap-2">
                  {c.include && (
                    <span className="text-sm font-semibold">{fmtGBP(value)}</span>
                  )}
                  <button
                    type="button"
                    onClick={cycleNext}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border text-xs font-bold transition ${badge.cls}`}
                    title="Click to cycle: Excluded → Low → Mid → High → Excluded"
                  >
                    {badge.label}
                  </button>
                </div>
              }
            >
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground">
                  {l.qty} {l.unit} · @ {fmtGBP(l.rate)} · L {fmtGBP(l.low)} · M {fmtGBP(l.mid)} · H {fmtGBP(l.high)}
                </div>
                {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
                <div className="flex gap-1">
                  {l.source === "ai" && (
                    <Badge variant="outline" className="h-4 text-[9px]">AI</Badge>
                  )}
                  {l.source === "epc" && (
                    <Badge variant="outline" className="h-4 border-sky-300 bg-sky-50 text-[9px] text-sky-700">
                      EPC
                    </Badge>
                  )}
                </div>
              </div>
            </CollapsibleCard>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-md border border-primary bg-primary/5 p-3">
        <p className="text-sm font-medium">Total refurb cost (items + 10% contingency)</p>
        <p className="text-lg font-bold text-primary">{fmtGBP(live.total)}</p>
      </div>

      {/* ---- EPC section ---- */}
      <div className="space-y-3 border-t pt-3">
        {epc?.source === "register" && epc.autoMatchConfidence === "best_guess" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Auto-matched to the closest register entry — check the address below is this
              property. If it's wrong, use "Refresh EPC" to pick the right certificate.
            </p>
          </div>
        )}
        {epc?.source !== "register" && (
          <p className="text-xs text-muted-foreground">
            {epc?.source === "pf_json"
              ? "Band and SAP score from the listing JSON."
              : "No EPC data found yet."}
          </p>
        )}

        {showMismatch && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Listing shows EPC {listingRate}, the register record shows {registerRate}. Pick the
              correct one:
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={resolveMismatchMut.isPending}
                onClick={() => resolveMismatchMut.mutate({ epc_rate: registerRate ?? undefined })}
              >
                Use register value ({registerRate})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={resolveMismatchMut.isPending}
                onClick={() =>
                  resolveMismatchMut.mutate({ epc_data: { ...epc, bandOverridden: true } })
                }
              >
                Keep listing value ({listingRate})
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-md border p-2.5 text-sm">
          {!manualOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {epc
                  ? `Displayed band: ${listingRate ?? registerRate ?? "—"}`
                  : "No EPC data found yet."}
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setManualOpen(true)}>
                  <PencilLine className="mr-1 h-3 w-3" />{" "}
                  {epc ? "Edit EPC manually" : "Enter EPC manually"}
                </Button>
                {credQ.isSuccess && configured && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Refresh EPC from register"
                    disabled={mut.isPending}
                    onClick={() => { setCandidates(null); mut.mutate(); }}
                  >
                    <RefreshCw className={`h-4 w-4 ${mut.isPending ? "animate-spin" : ""}`} />
                  </Button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" title="EPC register settings" className="h-8 w-8">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96" align="end">
                    <EpcCredentialsForm />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Band</Label>
                <Select value={manualBand} onValueChange={setManualBand}>
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {EPC_BANDS.map((b) => (
                      <SelectItem key={b.band} value={b.band}>
                        {b.band}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Score (1-100)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={manualScore}
                  onChange={(e) => setManualScore(e.target.value)}
                  className="h-8 w-24"
                  placeholder="Optional"
                />
              </div>
              <Button
                size="sm"
                disabled={!manualBand || manualMut.isPending}
                onClick={() => manualMut.mutate()}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setManualOpen(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        {candidates && (
          <div className="border-b pb-4">
            <h4 className="mb-1 text-sm font-semibold">Which of these is this property?</h4>
            <p className="mb-3 text-xs text-muted-foreground">
              The register doesn't have an exact address match for postcode {searchedPostcode} —
              rather than guess (and risk showing you another property's certificate), pick the
              correct one below. Nothing is saved until you choose.
            </p>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No certificates found for this postcode.
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((c) => (
                  <li
                    key={c.certificateNumber}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{c.address}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.band ? `Band ${c.band} · ` : ""}lodged{" "}
                        {c.lodgementDate
                          ? new Date(c.lodgementDate).toLocaleDateString("en-GB")
                          : "unknown date"}{" "}
                        · cert {c.certificateNumber}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selectMut.isPending}
                      onClick={() => selectMut.mutate(c.certificateNumber)}
                    >
                      Use this certificate
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {epc && (
          <div className="space-y-3">
            {epc.address && (
              <p className="text-xs text-muted-foreground">
                Matched certificate: {epc.address} · lodged{" "}
                {epc.lodgementDate
                  ? new Date(epc.lodgementDate).toLocaleDateString("en-GB")
                  : "unknown date"}
                {fetchedAt ? ` · cached ${new Date(fetchedAt).toLocaleDateString("en-GB")}` : ""}
              </p>
            )}

            <EpcChart
              currentScore={epc.currentScore}
              currentBand={epc.currentRating}
              potentialScore={epc.potentialScore}
              potentialBand={epc.potentialRating}
            />

            {epc.elements?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">What the assessment found</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {epc.elements.map((el: any) => (
                    <div key={el.key} className="rounded-md border p-2.5 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-medium">{el.label}</span>
                        {el.energyEff && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${EFF_LABEL_COLOR[el.energyEff.toLowerCase()] ?? ""}`}
                          >
                            {el.energyEff}
                          </Badge>
                        )}
                      </div>
                      {descriptionText(el.description) && (
                        <p className="text-xs text-muted-foreground">
                          {descriptionText(el.description)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {roadmap && (
              <div>
                <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <Flame className="h-4 w-4 text-orange-500" /> Improvement roadmap — assessor's
                  order, cheapest first
                </h4>
                <p className="mb-3 text-xs text-muted-foreground">
                  {epc.currentRating}
                  {epc.currentScore != null ? ` (${epc.currentScore})` : ""} → {epc.potentialRating}
                  {epc.potentialScore != null ? ` (${epc.potentialScore})` : ""} is what the
                  assessor says is achievable doing every measure below, for a total indicative
                  spend of {fmtGBP(roadmap.totalCostMin)}–{fmtGBP(roadmap.totalCostMax)}. The
                  resulting score after each step is the register's own calculated cumulative figure
                  — not an estimate — so the "reaches D" / "reaches C" markers below are read
                  straight off the certificate.
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Tick the upgrades you want costed in — these feed the Refurb Estimator and the EPC
                  negotiation point. Items flagged from the AI photo condition scan are pre-ticked;
                  untick anything you disagree with.
                </p>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-2.5 text-sm">
                  <span>
                    Selected: <span className="font-semibold">{epcTotals.count}</span> of{" "}
                    {epcMeasureCandidates.length} measures · est.{" "}
                    <span className="font-semibold">
                      {fmtGBP(epcTotals.low)}–{fmtGBP(epcTotals.high)}
                    </span>{" "}
                    (mid {fmtGBP(epcTotals.mid)})
                  </span>
                </div>
                <ol className="space-y-2">
                  {epcMeasureCandidates.map((c) => {
                    const isSelected = selected.some((sel) => sel.index === c.index);
                    return (
                      <li key={c.index} className="rounded-md border p-2.5 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-1 items-start gap-2">
                            <Checkbox
                              className="mt-0.5"
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                setOverrides((prev) => ({ ...prev, [c.index]: !!checked }))
                              }
                            />
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{c.title}</span>
                                {c.crossesIntoC && (
                                  <Badge className="bg-green-600 text-[10px] text-white">
                                    reaches C here
                                  </Badge>
                                )}
                                {c.aiRecommended && (
                                  <Badge
                                    variant="outline"
                                    className="border-sky-300 bg-sky-50 text-[10px] text-sky-700"
                                  >
                                    <Sparkles className="mr-1 h-3 w-3" /> AI flagged
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {c.resultingScore != null && (
                                  <>
                                    Resulting score after this step: {c.resultingScore}
                                    {c.resultingBand ? ` (band ${c.resultingBand})` : ""}
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold">
                              {fmtGBP(c.costMin ?? 0)}–{fmtGBP(c.costMax ?? c.costMin ?? 0)}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {epc.certificateUrl && (
                  <a
                    href={epc.certificateUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-xs text-accent underline"
                  >
                    View the official certificate on the government register ↗
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, v, highlight }: { label: string; v: string; highlight?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-md border p-2 ${highlight ? "border-primary bg-primary/5" : ""}`}>
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`truncate text-sm font-semibold sm:text-base ${highlight ? "text-primary" : ""}`}>{v}</p>
    </div>
  );
}

/** The classic EPC certificate "ladder" — colour bands A–G with markers for the current and
 *  potential SAP scores, drawn to scale (1–100) so the gap between them reads at a glance. */
function EpcChart({
  currentScore,
  currentBand,
  potentialScore,
  potentialBand,
}: {
  currentScore: number | null;
  currentBand: string | null;
  potentialScore: number | null;
  potentialBand: string | null;
}) {
  const pct = (score: number) => Math.min(100, Math.max(0, score));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
        <RatingChip label="Current" band={currentBand} score={currentScore} />
        <RatingChip label="Potential" band={potentialBand} score={potentialScore} />
      </div>
      <div className="relative h-10 overflow-hidden rounded-md border">
        <div className="flex h-full w-full">
          {EPC_BANDS.slice()
            .reverse()
            .map((b) => (
              <div
                key={b.band}
                className="relative flex h-full items-center justify-end pr-1.5 text-[11px] font-bold text-white"
                style={{ width: `${b.max - b.min + 1}%`, backgroundColor: b.color }}
              >
                {b.band}
              </div>
            ))}
        </div>
        {currentScore != null && (
          <Marker
            pct={pct(currentScore)}
            label={`Current ${currentScore}`}
            className="border-slate-900"
          />
        )}
        {potentialScore != null && potentialScore !== currentScore && (
          <Marker
            pct={pct(potentialScore)}
            label={`Potential ${potentialScore}`}
            className="border-slate-500 border-dashed"
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>1 (lowest efficiency)</span>
        <span>100 (highest efficiency)</span>
      </div>
    </div>
  );
}

function Marker({ pct, label, className }: { pct: number; label: string; className?: string }) {
  return (
    <div className="absolute top-0 h-full" style={{ left: `${pct}%` }} title={label}>
      <div className={`h-full w-0 border-l-2 ${className}`} />
    </div>
  );
}

function RatingChip({
  label,
  band,
  score,
}: {
  label: string;
  band: string | null;
  score: number | null;
}) {
  const b = EPC_BANDS.find((x) => x.band === (band ?? bandForScore(score)));
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className="flex h-7 w-7 items-center justify-center rounded font-bold text-white"
        style={{ backgroundColor: b?.color ?? "#999" }}
      >
        {band ?? "?"}
      </span>
      {score != null && <span className="text-xs text-muted-foreground">({score}/100)</span>}
    </div>
  );
}

/** Each user brings their own free GOV.UK "Get energy performance of buildings data" account and
 *  signs in with GOV.UK One Login to generate a personal bearer token — saved to *their* profile
 *  row only (RLS-scoped), never a shared platform secret, so nobody else's token ever touches this
 *  app's config. The token is write-only from the browser's perspective: once saved we only ever
 *  ask the server "is one configured?", never read it back. */
function EpcCredentialsForm() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getEpcCredentialsStatus);
  const save = useServerFn(saveEpcCredentials);
  const clear = useServerFn(clearEpcCredentials);

  const q = useQuery({
    queryKey: ["epc-credentials"],
    queryFn: () => getStatus({ data: {} } as any),
  });
  const status: any = q.data;
  const configured = !!status?.configured;

  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!configured) setEditing(true);
  }, [configured]);

  const saveMut = useMutation({
    mutationFn: () => save({ data: { token } }),
    onSuccess: () => {
      toast.success("EPC register token saved to your account");
      setToken("");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["epc-credentials"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const clearMut = useMutation({
    mutationFn: () => clear({ data: {} } as any),
    onSuccess: () => {
      toast.success("EPC register token removed");
      setToken("");
      setEditing(true);
      qc.invalidateQueries({ queryKey: ["epc-credentials"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading) return null;

  if (configured && !editing) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          "Refresh EPC" pulls the lodged certificate, full element-by-element breakdown and the
          assessor's costed improvement recommendations straight from the register.
        </p>
        <span className="flex items-center gap-2 text-muted-foreground">
          <KeyRound className="h-4 w-4 text-emerald-600" />
          EPC register connected — your bearer token is saved to your account and used only for your
          fetches.
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Replace token
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={clearMut.isPending}
            onClick={() => {
              if (confirm("Remove your saved EPC register token?")) clearMut.mutate();
            }}
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
        Bring your own free{" "}
        <span className="font-medium text-foreground">
          "Get energy performance of buildings data"
        </span>{" "}
        account. Sign in with GOV.UK One Login on the register's site and generate a personal access
        token from your account page, then paste it here. It's stored against your account only —
        gated so only you can read or write it — and is never shared with other users or written
        into this app's source/config.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="epc-token">Bearer token</Label>
        <Input
          id="epc-token"
          type="password"
          placeholder={
            configured
              ? "Enter new token to replace the saved one"
              : "Paste your EPC register access token"
          }
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={!token || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? "Saving…" : "Save token"}
        </Button>
        {configured && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setToken("");
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
