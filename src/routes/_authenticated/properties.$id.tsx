import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { getProperty, updateProperty } from "@/lib/ingest.functions";
import { listPersonas } from "@/lib/personas.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { analyseProperty } from "@/lib/analysis/engine";
import type { AnalysisOutput, NegotiationGuidance, NegotiationPoint, OverrideKey, SliderOverrides, StrategyNumber, StrategyResult } from "@/lib/analysis/types";
import { OVERRIDE_BOUNDS } from "@/lib/analysis/types";
import { buildTalkingPointsScript } from "@/lib/analysis/talking-points";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { extractPriceHistory, fmtHistoryDate } from "@/lib/analysis/price-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { PhotosPanel } from "@/components/PhotosPanel";
import { EpcPanel } from "@/components/EpcPanel";
import { DealSheetPanel } from "@/components/DealSheetPanel";
import { RefurbPanel } from "@/components/RefurbPanel";
import { RiskChips } from "@/components/RiskChips";
import { DealScoreInfo } from "@/components/DealScoreInfo";
import { InsuranceInfo } from "@/components/InsuranceInfo";
import { DealIndicators } from "@/components/DealIndicators";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import { ImageLibrary } from "@/components/ImageLibrary";
import { ImageCarousel } from "@/components/ImageCarousel";
import { HmoLayoutPanel } from "@/components/HmoLayoutPanel";
import { SurveyStrategyPanel } from "@/components/SurveyStrategyPanel";
import { MarketComparablesPanel } from "@/components/MarketComparablesPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { enrichFromUrl, enrichFromPfJson } from "@/lib/enrich.functions";
import { lookupArticle4ByPostcode } from "@/lib/article4.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtGBP, fmtNum, fmtPct } from "@/lib/format";
import { bestOfSelected, strategiesInScope, useStrategyFilter } from "@/lib/strategy-filter";
import { partitionImageUrls } from "@/lib/images";
import { ArrowLeft, ExternalLink, EyeOff, AlertTriangle, Sparkles, CheckCircle2, XCircle, Link2, Loader2, Home, FileJson, RotateCcw, PencilLine, Wrench, Images, Target, ShieldCheck, MapPin, Camera, MessageSquareText, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: () => ({ meta: [{ title: "Property — Deal Negotiator" }] }),
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
  const lookupA4 = useServerFn(lookupArticle4ByPostcode);

  const prop = useQuery({ queryKey: ["property", id], queryFn: () => getProp({ data: { id } }) });
  const personasQ = useQuery({ queryKey: ["personas"], queryFn: () => listP({ data: {} } as any) });
  const personas = (personasQ.data ?? []) as any[];
  const [personaId, setPersonaId] = useState<string | null>(null);
  const persona = useMemo(() => personas.find((p) => p.id === personaId) ?? personas.find((p) => p.is_default) ?? personas[0], [personas, personaId]);

  const { selected: lensSelected } = useStrategyFilter();
  const [over, setOver] = useState<SliderOverrides>({});
  const tune = (key: OverrideKey, value: number) => setOver((o) => ({ ...o, [key]: value }));
  const resetOne = (key: OverrideKey) => setOver((o) => { const { [key]: _drop, ...rest } = o; return rest; });
  const resetAll = () => setOver({});
  const toggleSourcingBuffer = (enabled: boolean) =>
    setOver((o) => enabled ? { ...o, sourcingBufferEnabled: true } : (() => { const { sourcingBufferEnabled: _drop, ...rest } = o; return rest; })());

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
  const [editingAsking, setEditingAsking] = useState(false);
  const [askingDraft, setAskingDraft] = useState("");
  const [pfJsonText, setPfJsonText] = useState("");
  const [heroOpenIndex, setHeroOpenIndex] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<"photos" | "refurb" | "library" | "enrich" | null>(null);
  const enrichJsonMut = useMutation({
    mutationFn: (json: string) => enrichJson({ data: { propertyId: id, json } }),
    onSuccess: (r: any) => {
      toast.success(`Enriched: ${r.fieldsUpdated.length} fields, ${r.totalImages} images`);
      setPfJsonText(""); setActivePanel(null);
      qc.invalidateQueries({ queryKey: ["property", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const article4Mut = useMutation({
    mutationFn: (postcode: string) => lookupA4({ data: { postcode, propertyId: id } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["property", id] });
      if (r.status === "inside") {
        toast.warning(`Article 4 confirmed — ${r.areas.length} direction(s) found for ${r.postcode}. HMO strategy score has been adjusted.`);
      } else {
        toast.success(`No Article 4 directions found for ${r.postcode} via the UK Planning Data API.`);
      }
    },
    onError: (e: any) => toast.error(`Article 4 check failed: ${e.message}`),
  });

  if (prop.isLoading || personasQ.isLoading) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!prop.data || !persona || !analysis) return <AppShell><p>Not found</p></AppShell>;

  const p = prop.data as any;
  const eff = analysis.effectiveInputs;
  const inScopeStrategies = strategiesInScope(analysis.strategies, lensSelected);
  const bestInScope = bestOfSelected(analysis.strategies, lensSelected);
  const overallBest = analysis.strategies.find((s) => s.key === analysis.bestStrategy)!;
  const best = bestInScope ?? overallBest;
  const noLensFit = !bestInScope;
  const defaultStrategyTab = (inScopeStrategies.find((s) => s.key === best.key) ?? inScopeStrategies[0] ?? best).key;
  const allImages: string[] = Array.isArray(p.image_urls) ? p.image_urls : [];
  const { photos: heroImagesRaw, floorPlans } = partitionImageUrls(allImages);
  const heroImages = Array.from(new Set(heroImagesRaw));
  const heroCarouselImages = heroImages.map((url) => ({ url }));

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link to="/properties" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All properties
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{p.hide_address ? "Property (address hidden)" : p.address}</h1>
            <Link to="/properties/$id/guide" params={{ id }}>
              <Button size="sm" variant="outline"><Sparkles className="mr-2 h-4 w-4" />Guided walkthrough</Button>
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
            {p.baths && <Badge variant="outline">{p.baths} bath</Badge>}
            {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
            {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
            {p.tenure && <Badge variant="outline">{p.tenure}</Badge>}
            {p.area_sqm && <Badge variant="outline">{Math.round(p.area_sqm)} m²</Badge>}
            {editingAsking ? (
              <span className="inline-flex items-center gap-1">
                <Input
                  autoFocus
                  type="number"
                  min={1}
                  step="1"
                  value={askingDraft}
                  onChange={(e) => setAskingDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = Number(askingDraft);
                      if (n > 0) { updateMut.mutate({ asking_price_gbp: n }); setEditingAsking(false); }
                    } else if (e.key === "Escape") {
                      setEditingAsking(false);
                    }
                  }}
                  placeholder="Asking price (£)"
                  className="h-7 w-32 text-sm"
                />
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!(Number(askingDraft) > 0)}
                  onClick={() => { const n = Number(askingDraft); updateMut.mutate({ asking_price_gbp: n }); setEditingAsking(false); }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingAsking(false)}>Cancel</Button>
              </span>
            ) : p.asking_price_gbp > 0 ? (
              <button
                type="button"
                onClick={() => { setAskingDraft(String(p.asking_price_gbp)); setEditingAsking(true); }}
                title="Click to edit asking price"
              >
                <Badge className="cursor-pointer hover:opacity-80">Asking {fmtGBP(p.asking_price_gbp)} <PencilLine className="ml-1 h-3 w-3" /></Badge>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setAskingDraft(""); setEditingAsking(true); }}
                title="Asking price is missing — click to enter it"
              >
                <Badge variant="outline" className="cursor-pointer border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Set asking price
                </Badge>
              </button>
            )}
            {p.article4_status === "inside" && <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">Article 4 — inside</Badge>}
            {p.article4_status === "partial" && <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">Article 4 — partial</Badge>}
            {!p.article4_status && p.pf_json?.propertyLight?.article4Status && (
              <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">
                Article 4 — {String(p.pf_json.propertyLight.article4Status)}
              </Badge>
            )}
            {p.postcode && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                disabled={article4Mut.isPending}
                onClick={() => article4Mut.mutate(p.postcode)}
                title="Check Article 4 status via UK Planning Data API"
              >
                {article4Mut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <MapPin className="mr-1 h-3 w-3" />}
                {p.article4_status ? "Re-check Article 4" : "Check Article 4"}
              </Button>
            )}
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
          <div className="flex items-center justify-end gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            Deal score
            <DealScoreInfo overallScore={analysis.overallScore} breakdown={analysis.overallScoreBreakdown} best={best} />
          </div>
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

      <BottomLineCard analysis={analysis} best={best} />

      {heroImages.length > 0 && (
        <Card className="mb-4 overflow-hidden p-0">
          <div className="grid grid-cols-4 gap-1">
            <button className="col-span-4 sm:col-span-2 sm:row-span-2" onClick={() => setHeroOpenIndex(0)}>
              <img src={heroImages[0]} alt="" className="h-full max-h-[360px] w-full object-cover transition hover:opacity-90" />
            </button>
            {heroImages.slice(1, 5).map((u, i) => (
              <button key={i} onClick={() => setHeroOpenIndex(i + 1)}>
                <img src={u} alt="" className="h-32 w-full object-cover transition hover:opacity-90 sm:h-[178px]" loading="lazy" />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <button onClick={() => setHeroOpenIndex(0)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Images className="h-3.5 w-3.5" /> View fullscreen — browse all {heroImages.length} photos
            </button>
            {heroImages.length > 5 && (
              <button onClick={() => setActivePanel("library")} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                +{heroImages.length - 5} more — open in image library
              </button>
            )}
          </div>
        </Card>
      )}
      <ImageCarousel images={heroCarouselImages} index={heroOpenIndex} onIndexChange={setHeroOpenIndex} onClose={() => setHeroOpenIndex(null)} />

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

      <HmoLayoutPanel propertyId={id} hasFloorPlan={floorPlans.length > 0} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button onClick={() => setActivePanel("photos")} className="rounded-md border p-3 text-left transition hover:bg-muted/40">
          <div className="flex items-center gap-2 text-sm font-medium"><Camera className="h-4 w-4 text-muted-foreground" /> Photos</div>
          <p className="mt-0.5 text-xs text-muted-foreground">Run AI condition scan</p>
        </button>
        <button onClick={() => setActivePanel("refurb")} className="rounded-md border p-3 text-left transition hover:bg-muted/40">
          <div className="flex items-center gap-2 text-sm font-medium"><Wrench className="h-4 w-4 text-muted-foreground" /> AI condition report</div>
          <p className="mt-0.5 text-xs text-muted-foreground">Refurb estimate from photos</p>
        </button>
        <button onClick={() => setActivePanel("library")} className="rounded-md border p-3 text-left transition hover:bg-muted/40">
          <div className="flex items-center gap-2 text-sm font-medium"><Images className="h-4 w-4 text-muted-foreground" /> Image library</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{heroImages.length} photo{heroImages.length === 1 ? "" : "s"}, organised by room</p>
        </button>
        <button onClick={() => setActivePanel("enrich")} className="rounded-md border p-3 text-left transition hover:bg-muted/40">
          <div className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4 text-muted-foreground" /> Enrich from listing URL</div>
          <p className="mt-0.5 text-xs text-muted-foreground">Pull details, images or PF JSON</p>
        </button>
      </div>

      <Dialog open={activePanel === "photos"} onOpenChange={(o) => setActivePanel(o ? "photos" : null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Photos</DialogTitle></DialogHeader>
          <PhotosPanel propertyId={id} listingImageCount={heroImages.length} />
        </DialogContent>
      </Dialog>

      <Dialog open={activePanel === "refurb"} onOpenChange={(o) => setActivePanel(o ? "refurb" : null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>AI condition report</DialogTitle></DialogHeader>
          <RefurbPanel property={p} onTotalChange={(t) => { /* live total — applied via Save in panel */ void t; }} />
        </DialogContent>
      </Dialog>

      <Dialog open={activePanel === "library"} onOpenChange={(o) => setActivePanel(o ? "library" : null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Image library</DialogTitle></DialogHeader>
          <ImageLibrary propertyId={id} urls={heroImages} defaultExpanded />
        </DialogContent>
      </Dialog>

      <Dialog open={activePanel === "enrich"} onOpenChange={(o) => setActivePanel(o ? "enrich" : null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Enrich from listing URL</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
          <p className="text-xs text-muted-foreground">Supports Rightmove, Zoopla, OnTheMarket, Boomin, PrimeLocation. Requires Firecrawl in Connectors.</p>
          <div className="border-t pt-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium"><FileJson className="h-4 w-4" /> Paste PF JSON</p>
            <p className="mb-2 text-sm text-muted-foreground">Paste the full JSON object from Property Filter. Existing fields are kept; only missing fields are filled. New image URLs are appended.</p>
            <Textarea value={pfJsonText} onChange={(e) => setPfJsonText(e.target.value)} placeholder='{"propertyLight":{...},"propertyDetail":{...}}' className="h-48 font-mono text-xs" />
            <Button className="mt-2" onClick={() => enrichJsonMut.mutate(pfJsonText)} disabled={!pfJsonText.trim() || enrichJsonMut.isPending}>
              {enrichJsonMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enrich now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {!analysis.personaMatch.pass && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-medium text-amber-900">Investor criteria mismatch</p>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                {analysis.personaMatch.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {noLensFit && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex items-start gap-3 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
              <p className="text-sm text-amber-900">
                No selected strategy in your lens is feasible for this property. Showing the overall best strategy
                ({best.name}) instead — adjust the strategy lens in the top nav to broaden the view.
              </p>
            </CardContent>
          </Card>
        )}
        <OfferPlanCard
          guidance={analysis.negotiationGuidance}
          negotiation={analysis.negotiation}
          personaPass={analysis.personaMatch.pass}
          sourcingBufferEnabled={!!over.sourcingBufferEnabled}
          onToggleSourcingBuffer={toggleSourcingBuffer}
          arv={analysis.effectiveInputs.arv}
          arvOverridden={over.arv !== undefined}
          sourcingProfitPct={over.sourcingProfitPct ?? 0.25}
          sourcingFeeGbp={over.sourcingFeeGbp ?? 5000}
          onTune={tune}
          onResetOne={resetOne}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-accent" /> Negotiation playbook</CardTitle>
            <p className="text-sm text-muted-foreground">Weighted evidence to take to the agent. Full costs are shown where useful, but only the defensible share is counted into the offer.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.negotiation.filter((n) => n.gbp_impact > 250).map((n, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">{n.category.replace("_", " ")}</Badge>
                      <p className="font-medium">{n.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.description}</p>
                    {n.specOptions && n.specOptions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {n.specOptions.map((s) => (
                          <div key={s.rating} className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                            <Badge className="h-5 w-5 justify-center rounded-full p-0 text-[10px]">{s.rating}</Badge>
                            <span className="text-muted-foreground">{s.label}</span>
                            <span className="font-semibold">{fmtGBP(s.gbp)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary">−{fmtGBP(n.gbp_impact)}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">{n.confidence}</div>
                  </div>
                </div>
              </div>
            ))}
            {analysis.negotiation.some((n) => n.gbp_impact <= 250) && (
              <TooltipProvider delayDuration={120}>
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed p-2.5">
                  <span className="mr-1 text-xs text-muted-foreground">Also factored in:</span>
                  {analysis.negotiation.filter((n) => n.gbp_impact <= 250).map((n, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="cursor-default gap-1 text-xs font-normal">
                          {n.title} <span className="font-semibold text-primary">−{fmtGBP(n.gbp_impact)}</span>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[300px] text-xs">{n.description}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
            )}
            {!p.ai_payload?.landlordReadiness && (
              <p className="text-xs text-muted-foreground">
                Run AI photo analysis (Photos &amp; AI condition report, above) to also factor white-goods and garden-clearance costs into this offer.
              </p>
            )}
            <div className="flex items-center justify-between rounded-md border border-primary bg-primary/5 p-3">
              <p className="text-sm font-medium">Weighted leverage used by the model</p>
              <p className="text-lg font-bold text-primary">−{fmtGBP(analysis.negotiationTotal)}</p>
            </div>
            {analysis.negotiationGuidance.warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="mb-1 font-medium">Credibility guardrails</p>
                <ul className="list-inside list-disc">
                  {analysis.negotiationGuidance.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <NegotiationPanel
          property={p}
          guidance={analysis.negotiationGuidance}
          onApplyOffer={(gbp) => { tune("offer_price", gbp); toast.success(`Target offer set to ${fmtGBP(gbp)}`); }}
        />

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
            <Tabs defaultValue={defaultStrategyTab}>
              <TabsList className="flex w-full flex-wrap">
                {inScopeStrategies.map((s) => (
                  <TabsTrigger key={s.key} value={s.key} className="flex-1">
                    {s.name} <span className="ml-1.5 text-xs opacity-60">{s.dealScore}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {inScopeStrategies.map((s) => (
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
              <PriceHistoryTimeline property={p} />
            </CardContent>
          </Card>
        )}

        {p.pf_json && (
          <MarketComparablesPanel
            pf_json={p.pf_json}
            askingPrice={p.asking_price_gbp}
          />
        )}
        <EpcPanel propertyId={id} />
        <SurveyStrategyPanel property={p} />
        <DealSheetPanel propertyId={id} overrides={over} />
      </div>
    </AppShell>
  );
}

function BottomLineCard({ analysis, best }: { analysis: AnalysisOutput; best: StrategyResult }) {
  const g = analysis.negotiationGuidance;
  return (
    <Card className="mb-4 border-primary/30 bg-primary/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Bottom line</span>
          <Badge className="bg-primary">{analysis.overallScore}/100</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{best.name}: {best.summary}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <DealIndicators indicators={analysis.dealIndicators} />
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Opening bid" v={fmtGBP(g.openingOffer)} />
          <Stat label="Target deal price" v={fmtGBP(g.targetOffer)} />
          <Stat label="Walk-away ceiling" v={fmtGBP(g.walkAwayOffer)} />
          <div className="rounded-md bg-muted/50 p-2.5">
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Insurance (est.)</p>
              <InsuranceInfo insurance={analysis.insurance} />
            </div>
            <p className="font-medium">{fmtGBP(analysis.insurance.annualPremiumGbp)}/yr</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TalkingPointsButton({ guidance, negotiation }: { guidance: NegotiationGuidance; negotiation: NegotiationPoint[] }) {
  const [copied, setCopied] = useState(false);
  const script = useMemo(() => buildTalkingPointsScript(guidance, negotiation), [guidance, negotiation]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <MessageSquareText className="h-3.5 w-3.5" /> Talking points
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <p className="text-sm font-medium">What to say to the agent / seller</p>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap p-3 text-xs leading-relaxed text-muted-foreground">{script}</pre>
      </PopoverContent>
    </Popover>
  );
}

function OfferPlanCard({
  guidance, negotiation, personaPass, sourcingBufferEnabled, onToggleSourcingBuffer,
  arv, arvOverridden, sourcingProfitPct, sourcingFeeGbp, onTune, onResetOne,
}: {
  guidance: NegotiationGuidance;
  negotiation: NegotiationPoint[];
  personaPass: boolean;
  sourcingBufferEnabled: boolean;
  onToggleSourcingBuffer: (enabled: boolean) => void;
  arv: number;
  arvOverridden: boolean;
  sourcingProfitPct: number;
  sourcingFeeGbp: number;
  onTune: (key: OverrideKey, v: number) => void;
  onResetOne: (key: OverrideKey) => void;
}) {
  const discount = guidance.askingPrice > 0 ? (guidance.askingPrice - guidance.targetOffer) / guidance.askingPrice : 0;
  const sb = guidance.sourcingBuffer;
  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Offer plan</span>
          <TalkingPointsButton guidance={guidance} negotiation={negotiation} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Opening bid" v={fmtGBP(guidance.openingOffer)} />
          <Stat label="Target deal price" v={fmtGBP(guidance.targetOffer)} />
          <Stat label="Walk-away ceiling" v={fmtGBP(guidance.walkAwayOffer)} />
          <Stat label="Discount at target" v={fmtPct(discount)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="capitalize">{guidance.stance.replace("-", " ")}</Badge>
          <Badge variant="outline">{guidance.priceBand}</Badge>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Underwriting uses the target price, not the lower opening anchor.
          </span>
          {!personaPass && <span className="text-amber-700">Current investor criteria do not fully fit this property.</span>}
        </div>
        {guidance.epcToCCost != null && (
          <p className="mt-2 text-xs text-muted-foreground">
            EPC-to-C spend (~{fmtGBP(guidance.epcToCCost)}) is partly baked into the walk-away ceiling above — required to let from 2030 under MEES rules.
          </p>
        )}
        <div className="mt-4 rounded-md border bg-background/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Sourcing buffer</p>
              <p className="text-xs text-muted-foreground">
                {sb
                  ? `Opening bid recomputed from post-refurb GDV ${fmtGBP(sb.gdv)} × ${fmtPct(1 - sb.profitPct)} (after ${fmtPct(sb.profitPct)} profit) − refurb − ${fmtGBP(sb.sourcingFeeGbp)} sourcing fee = ${fmtGBP(sb.computedOffer)}.`
                  : "Recompute the opening bid from a GDV basis: post-refurb GDV × (1 − target profit %) − refurb cost − sourcing fee."}
              </p>
            </div>
            <Switch checked={sourcingBufferEnabled} onCheckedChange={onToggleSourcingBuffer} />
          </div>
          {sourcingBufferEnabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">GDV (post-refurb ARV)</p>
                  {!arvOverridden && <span className="text-[10px] uppercase text-muted-foreground">est. (offer × 1.18)</span>}
                </div>
                <p className="text-base font-semibold">{fmtGBP(arv)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Slider
                    value={[arv]}
                    min={OVERRIDE_BOUNDS.arv.min}
                    max={OVERRIDE_BOUNDS.arv.max}
                    step={OVERRIDE_BOUNDS.arv.step}
                    onValueChange={([v]) => onTune("arv", v)}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onResetOne("arv")}
                    disabled={!arvOverridden}
                    title="Reset to estimated GDV"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Set this to a comparable-evidenced post-refurb valuation, not the asking price.</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">Target profit margin</p>
                <p className="text-base font-semibold">{fmtPct(sourcingProfitPct)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Slider
                    value={[sourcingProfitPct * 100]}
                    min={OVERRIDE_BOUNDS.sourcingProfitPct.min}
                    max={OVERRIDE_BOUNDS.sourcingProfitPct.max}
                    step={OVERRIDE_BOUNDS.sourcingProfitPct.step}
                    onValueChange={([v]) => onTune("sourcingProfitPct", v / 100)}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onResetOne("sourcingProfitPct")}
                    disabled={sourcingProfitPct === 0.25}
                    title="Reset to 25%"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">Sourcing / packaging fee</p>
                <p className="text-base font-semibold">{fmtGBP(sourcingFeeGbp)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Slider
                    value={[sourcingFeeGbp]}
                    min={OVERRIDE_BOUNDS.sourcingFeeGbp.min}
                    max={OVERRIDE_BOUNDS.sourcingFeeGbp.max}
                    step={OVERRIDE_BOUNDS.sourcingFeeGbp.step}
                    onValueChange={([v]) => onTune("sourcingFeeGbp", v)}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onResetOne("sourcingFeeGbp")}
                    disabled={sourcingFeeGbp === 5000}
                    title="Reset to £5,000"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PriceHistoryTimeline({ property }: { property: any }) {
  const history = useMemo(() => extractPriceHistory(property), [property]);
  if (history.length < 2) return null;
  const oldest = history[history.length - 1];
  const newest = history[0];
  const totalChange = newest.value - oldest.value;
  return (
    <div className="mt-4 border-t pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tracked price history</p>
        {totalChange !== 0 && (
          <span className={cn("text-xs font-medium", totalChange < 0 ? "text-emerald-700" : "text-amber-700")}>
            {totalChange < 0 ? "−" : "+"}{fmtGBP(Math.abs(totalChange))} since {fmtHistoryDate(oldest.date)}
          </span>
        )}
      </div>
      <ul className="space-y-1 text-sm">
        {history.map((h, i) => (
          <li key={`${h.date}-${h.value}`} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{fmtHistoryDate(h.date)}{i === 0 && <Badge variant="outline" className="ml-2 h-5 text-[10px]">current</Badge>}</span>
            <span className="flex items-center gap-2">
              <span className="font-medium">{fmtGBP(h.value)}</span>
              {h.changeFromPrevious != null && h.changeFromPrevious !== 0 && (
                <span className={cn("text-xs", h.changeFromPrevious < 0 ? "text-emerald-700" : "text-amber-700")}>
                  ({h.changeFromPrevious < 0 ? "−" : "+"}{fmtGBP(Math.abs(h.changeFromPrevious))})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
    : n.format === "count" ? fmtNum(Math.round(n.value), 0)
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
