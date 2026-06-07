import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { getProperty, updateProperty } from "@/lib/ingest.functions";
import { listPersonas } from "@/lib/personas.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { analyseProperty } from "@/lib/analysis/engine";
import type { OverrideKey, SliderOverrides, StrategyNumber, StrategyResult } from "@/lib/analysis/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { PhotosPanel } from "@/components/PhotosPanel";
import { DealSheetPanel } from "@/components/DealSheetPanel";
import { RefurbPanel } from "@/components/RefurbPanel";
import { RiskChips } from "@/components/RiskChips";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import { ImageLibrary } from "@/components/ImageLibrary";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { enrichFromUrl, enrichFromPfJson } from "@/lib/enrich.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtGBP, fmtNum, fmtPct } from "@/lib/format";
import { partitionImageUrls } from "@/lib/images";
import { ArrowLeft, ExternalLink, EyeOff, AlertTriangle, Sparkles, CheckCircle2, XCircle, Link2, Loader2, Home, FileJson, RotateCcw, PencilLine, Wrench } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: () => ({ meta: [{ title: "Property — Deal Sourcer" }] }),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getProp = useServerFn(getProperty);
  const listP = useServerFn(listPersonas);
  const update = useServerFn(updateProperty);
  const enrich = useServerFn(enrichFromUrl);
  const enrichJson = useServerFn(enrichFromPfJson);

  const prop = useQuery({ queryKey: ["property", id], queryFn: () => getProp({ data: { id } }) });
  const personasQ = useQuery({ queryKey: ["personas"], queryFn: () => listP({ data: {} } as any) });
  const personas = (personasQ.data ?? []) as any[];
  const [personaId, setPersonaId] = useState<string | null>(null);
  const persona = useMemo(() => personas.find((p) => p.id === personaId) ?? personas.find((p) => p.is_default) ?? personas[0], [personas, personaId]);

  const [over, setOver] = useState<SliderOverrides>({});
  const tune = (key: OverrideKey, value: number) => setOver((o) => ({ ...o, [key]: value }));
  const resetOne = (key: OverrideKey) => setOver((o) => { const { [key]: _drop, ...rest } = o; return rest; });
  const resetAll = () => setOver({});

  const analysis = useMemo(() => {
    if (!prop.data || !persona) return null;
    return analyseProperty(prop.data as any, persona as any, over);
  }, [prop.data, persona, over]);

  const updateMut = useMutation({
    mutationFn: (patch: any) => update({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property", id] }),
  });
  const [enrichUrl, setEnrichUrl] = useState("");
  const enrichMut = useMutation({
    mutationFn: (url: string) => enrich({ data: { propertyId: id, url } }),
    onSuccess: (r: any) => { toast.success(`Enriched: ${r.fieldsUpdated.length} fields, ${r.imageCount} images`); setEnrichUrl(""); qc.invalidateQueries({ queryKey: ["property", id] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const [pfJsonText, setPfJsonText] = useState("");
  const [pfDialogOpen, setPfDialogOpen] = useState(false);
  const enrichJsonMut = useMutation({
    mutationFn: (json: string) => enrichJson({ data: { propertyId: id, json } }),
    onSuccess: (r: any) => {
      toast.success(`Enriched: ${r.fieldsUpdated.length} fields, ${r.totalImages} images`);
      setPfJsonText(""); setPfDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["property", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (prop.isLoading || personasQ.isLoading) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!prop.data || !persona || !analysis) return <AppShell><p>Not found</p></AppShell>;

  const p = prop.data as any;
  const eff = analysis.effectiveInputs;
  const best = analysis.strategies.find((s) => s.key === analysis.bestStrategy)!;
  const allImages: string[] = Array.isArray(p.image_urls) ? p.image_urls : [];
  const { photos: heroImages, floorPlans } = partitionImageUrls(allImages);

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link to="/properties" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All properties
          </Link>
          <h1 className="text-2xl font-bold">{p.hide_address ? "Property (address hidden)" : p.address}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
            {p.baths && <Badge variant="outline">{p.baths} bath</Badge>}
            {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
            {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
            {p.tenure && <Badge variant="outline">{p.tenure}</Badge>}
            {p.area_sqm && <Badge variant="outline">{Math.round(p.area_sqm)} m²</Badge>}
            <Badge>Asking {fmtGBP(p.asking_price_gbp)}</Badge>
            {p.article4_status === "inside" && <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">Article 4 — inside</Badge>}
            {p.article4_status === "partial" && <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">Article 4 — partial</Badge>}
            {p.source_link && (
              <a href={p.source_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> View listing
              </a>
            )}
          </div>
          {analysis.riskFlags && analysis.riskFlags.length > 0 && (
            <div className="mt-2"><RiskChips flags={analysis.riskFlags as any} /></div>
          )}
        </div>
        <div className="text-right">
          <div className="text-5xl font-bold text-primary">{analysis.overallScore}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Deal score</div>
          <div className="mt-2">
            <Select value={persona.id} onValueChange={(v) => setPersonaId(v)}>
              <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {personas.map((pp) => (
                  <SelectItem key={pp.id} value={pp.id}>
                    {pp.name} {pp.is_default ? "★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Label htmlFor="hide" className="text-xs"><EyeOff className="inline h-3 w-3" /> Redact</Label>
            <Switch
              id="hide"
              checked={p.hide_address}
              onCheckedChange={(v) => { updateMut.mutate({ hide_address: v }); toast.success(v ? "Address hidden" : "Address visible"); }}
            />
          </div>
        </div>
      </div>

      {heroImages.length > 0 && (
        <Card className="mb-4 overflow-hidden p-0">
          <div className="grid grid-cols-4 gap-1">
            <div className="col-span-4 sm:col-span-2 sm:row-span-2">
              <img src={heroImages[0]} alt="" className="h-full max-h-[360px] w-full object-cover" />
            </div>
            {heroImages.slice(1, 5).map((u, i) => (
              <img key={i} src={u} alt="" className="h-32 w-full object-cover sm:h-[178px]" loading="lazy" />
            ))}
          </div>
          {heroImages.length > 5 && <p className="px-3 py-2 text-xs text-muted-foreground">+{heroImages.length - 5} more in listing</p>}
        </Card>
      )}

      {floorPlans.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Floor plan{floorPlans.length > 1 ? "s" : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("grid gap-3", floorPlans.length > 1 ? "sm:grid-cols-2" : "")}>
              {floorPlans.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-muted/40">
                  <img src={u} alt="Floor plan" className="h-[320px] w-full object-contain p-2" loading="lazy" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Enrich from listing URL</span>
          <Input
            placeholder="https://www.rightmove.co.uk/properties/..."
            value={enrichUrl}
            onChange={(e) => setEnrichUrl(e.target.value)}
            className="h-8 flex-1 min-w-[260px]"
          />
          <Button size="sm" disabled={!enrichUrl || enrichMut.isPending} onClick={() => enrichMut.mutate(enrichUrl)}>
            {enrichMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Home className="mr-2 h-4 w-4" />}
            Pull details + images
          </Button>
          <Dialog open={pfDialogOpen} onOpenChange={setPfDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><FileJson className="mr-2 h-4 w-4" />Paste PF JSON</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader><DialogTitle>Enrich from Property Filter JSON</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Paste the full JSON object from Property Filter. Existing fields are kept; only missing fields are filled. New image URLs are appended.</p>
              <Textarea value={pfJsonText} onChange={(e) => setPfJsonText(e.target.value)} placeholder='{"propertyLight":{...},"propertyDetail":{...}}' className="h-64 font-mono text-xs" />
              <Button onClick={() => enrichJsonMut.mutate(pfJsonText)} disabled={!pfJsonText.trim() || enrichJsonMut.isPending}>
                {enrichJsonMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enrich now
              </Button>
            </DialogContent>
          </Dialog>
          <p className="basis-full text-xs text-muted-foreground">Supports Rightmove, Zoopla, OnTheMarket, Boomin, PrimeLocation. Requires Firecrawl in Connectors.</p>
        </CardContent>
      </Card>

      {!analysis.personaMatch.pass && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-medium text-amber-900">Persona mismatch</p>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                {analysis.personaMatch.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Best strategy: {best.name}</span>
              <Badge className="bg-primary">{best.dealScore}/100</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{best.summary}</p>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-accent" /> Negotiation playbook</CardTitle>
            <p className="text-sm text-muted-foreground">Justified leverage points to take to the agent — the strategy numbers below start from these.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.negotiation.map((n, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">{n.category.replace("_", " ")}</Badge>
                      <p className="font-medium">{n.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary">−{fmtGBP(n.gbp_impact)}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">{n.confidence}</div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Strategy comparison</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Numbers start from the negotiation playbook, AI surveyor findings and refurb estimator — drag any tunable
                  cell's slider to flex it and watch the rest ripple through.
                </p>
              </div>
              {Object.keys(over).length > 0 && (
                <Button variant="outline" size="sm" onClick={resetAll}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset all tuning
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={best.key}>
              <TabsList className="flex w-full flex-wrap">
                {analysis.strategies.map((s) => (
                  <TabsTrigger key={s.key} value={s.key} className="flex-1">
                    {s.name} <span className="ml-1.5 text-xs opacity-60">{s.dealScore}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {analysis.strategies.map((s) => (
                <TabsContent key={s.key} value={s.key} className="pt-4">
                  <StrategyView s={s} onTune={tune} onReset={resetOne} />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {p.pf_json && (
          <Card>
            <CardHeader><CardTitle className="text-base">Property Filter signals</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {p.pf_json.propertyLight?.lastSold && (
                  <Stat label="Last sold" v={`${fmtGBP(p.pf_json.propertyLight.lastSold.value)} (${new Date(p.pf_json.propertyLight.lastSold.date).getFullYear()})`} />
                )}
                {p.pf_json.propertyLight?.equity != null && <Stat label="Seller equity" v={fmtPct(p.pf_json.propertyLight.equity)} />}
                {p.pf_json.propertyLight?.article4Status && <Stat label="Article 4" v={p.pf_json.propertyLight.article4Status} />}
                {p.pf_json.propertyLight?.councilTax && <Stat label="Council tax" v={p.pf_json.propertyLight.councilTax} />}
                {p.pf_json.propertyLight?.multipleReduce != null && <Stat label="Reductions" v={String(p.pf_json.propertyLight.multipleReduce)} />}
                {p.pf_json.propertyLight?.multipleBack != null && <Stat label="Back-on-market" v={String(p.pf_json.propertyLight.multipleBack)} />}
              </div>
            </CardContent>
          </Card>
        )}

        <PhotosPanel propertyId={id} />
        <RefurbPanel property={p} onTotalChange={(t) => { /* live total — applied via Save in panel */ void t; }} />
        <ImageLibrary urls={heroImages} />
        <NegotiationPanel
          property={p}
          refurbTotal={analysis.effectiveInputs.refurb_cost}
          onApplyOffer={(gbp) => { tune("offer_price", gbp); toast.success(`Offer set to ${fmtGBP(gbp)}`); }}
        />
        <DealSheetPanel propertyId={id} overrides={over} />
      </div>
    </AppShell>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{v}</p>
    </div>
  );
}

function fmtNumber(n: StrategyNumber) {
  return n.format === "gbp" ? fmtGBP(n.value)
    : n.format === "pct" ? fmtPct(n.value)
    : n.format === "months" ? `${fmtNum(n.value)} mo`
    : fmtNum(n.value, 2);
}

// Reasons that stem from the *numbers* (cash needed, DSCR, margin, ARV headroom) — i.e. the kind a
// slider tweak can cause or cure. Structural blockers (Article 4, licensing, leasehold, risk flags,
// title-split eligibility) are not "fixable" by nudging a slider back, so they're excluded.
const TUNABLE_CONSTRAINT_RE = /cash in|dscr|margin|profit|arv \(|exceed/i;

function StrategyView({ s, onTune, onReset }: { s: StrategyResult; onTune: (key: OverrideKey, v: number) => void; onReset: (key: OverrideKey) => void }) {
  const overridden = s.numbers.filter((n) => n.overrideKey && n.overridden);
  const overriddenKeys = Array.from(new Set(overridden.map((n) => n.overrideKey as OverrideKey)));
  const overriddenLabels = Array.from(new Set(overridden.map((n) => n.label)));
  const breakingReasons = (s.reasons ?? []).filter((r) => TUNABLE_CONSTRAINT_RE.test(r));
  const brokenByTuning = !s.feasible && overriddenKeys.length > 0 && breakingReasons.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {s.feasible
          ? <CheckCircle2 className="h-5 w-5 text-primary" />
          : <XCircle className="h-5 w-5 text-amber-600" />}
        <p className="text-sm">{s.summary}</p>
      </div>
      {s.reasons && s.reasons.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">Watch outs</p>
          <ul className="list-inside list-disc">
            {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {brokenByTuning && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">That combination isn't realistic</p>
                <p className="mt-0.5 text-xs text-destructive/80">
                  You've moved <span className="font-medium">{overriddenLabels.join(", ")}</span> away from what the
                  negotiation playbook, AI surveyor and refurb estimator computed — and at these settings the maths
                  below say this strategy no longer stacks up:
                </p>
              </div>
            </div>
            <Button size="sm" variant="destructive" className="shrink-0" onClick={() => overriddenKeys.forEach(onReset)}>
              <Wrench className="mr-1.5 h-3.5 w-3.5" /> Fix
            </Button>
          </div>
          <ul className="mt-2 list-inside list-disc pl-6 text-xs text-destructive/80">
            {breakingReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className="mt-2 pl-6 text-[11px] text-destructive/70">
            "Fix" snaps the tuned levers back to the computed values that made this strategy feasible.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {s.numbers.map((n, i) => (
          <TunableNumberCell key={i} n={n} onTune={onTune} onReset={onReset} />
        ))}
      </div>
    </div>
  );
}

function TunableNumberCell({ n, onTune, onReset }: { n: StrategyNumber; onTune: (key: OverrideKey, v: number) => void; onReset: (key: OverrideKey) => void }) {
  const isPct = n.format === "pct";
  const scale = isPct ? 100 : 1;

  return (
    <div className={cn("rounded-md border p-3", n.overridden && "border-primary/40 bg-primary/[0.04]")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{n.label}</p>
        {n.overridden && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
            <PencilLine className="h-2.5 w-2.5" /> Overridden
          </span>
        )}
      </div>
      <p className="text-lg font-semibold">{fmtNumber(n)}</p>
      {n.hint && <p className="mt-1 text-[10px] text-muted-foreground">{n.hint}</p>}
      {n.overrideKey && n.min != null && n.max != null && (
        <div className="mt-2.5 flex items-center gap-2">
          <Slider
            value={[n.value * scale]}
            min={n.min}
            max={n.max}
            step={n.step ?? 1}
            onValueChange={([v]) => onTune(n.overrideKey as OverrideKey, v / scale)}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => onReset(n.overrideKey as OverrideKey)}
            disabled={!n.overridden}
            title={n.overridden ? `Reset to computed value (${n.baseline != null ? fmtNumber({ ...n, value: n.baseline }) : "default"})` : "Already at the computed value"}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}