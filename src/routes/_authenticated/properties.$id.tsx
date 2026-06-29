import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { getProperty, updateProperty } from "@/lib/ingest.functions";
import { listPersonas } from "@/lib/personas.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { analyseProperty } from "@/lib/analysis/engine";
import type {
  AnalysisOutput,
  NegotiationGuidance,
  NegotiationPoint,
  OverrideKey,
  SliderOverrides,
  StrategyNumber,
  StrategyResult,
} from "@/lib/analysis/types";
import { OVERRIDE_BOUNDS } from "@/lib/analysis/types";
import { buildTalkingPointsScript } from "@/lib/analysis/talking-points";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { extractPriceHistory, fmtHistoryDate } from "@/lib/analysis/price-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { PhotosPanel } from "@/components/PhotosPanel";
import { DealSheetPanel } from "@/components/DealSheetPanel";
import { RefurbEpcPanel } from "@/components/RefurbEpcPanel";
import { RiskChips } from "@/components/RiskChips";
import { DealScoreInfo } from "@/components/DealScoreInfo";
import { InsuranceInfo } from "@/components/InsuranceInfo";
import { DealIndicators } from "@/components/DealIndicators";
import { NegotiationPanel } from "@/components/NegotiationPanel";
import { ImageLibrary } from "@/components/ImageLibrary";
import { ImageCarousel } from "@/components/ImageCarousel";
import { HmoLayoutPanel } from "@/components/HmoLayoutPanel";
import { SpecOptionsRow } from "@/components/SpecOptionsRow";
import { SurveyStrategyPanel } from "@/components/SurveyStrategyPanel";
import { MarketComparablesPanel } from "@/components/MarketComparablesPanel";
import { computeSurveyLeverage } from "@/lib/analysis/survey-strategy";
import { extractMarketDataFromPfJson } from "@/lib/parsers/json";
import { FormulaInfo } from "@/components/FormulaInfo";
import { OfferFloorInfo } from "@/components/OfferFloorInfo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { enrichFromUrl, enrichFromPfJson } from "@/lib/enrich.functions";
import { lookupArticle4ByPostcode } from "@/lib/article4.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtGBP, fmtNum, fmtPct } from "@/lib/format";
import { bestOfSelected, strategiesInScope, useStrategyFilter } from "@/lib/strategy-filter";
import { partitionImageUrls } from "@/lib/images";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  XCircle,
  Link2,
  Loader2,
  Home,
  FileJson,
  RotateCcw,
  PencilLine,
  Wrench,
  Images,
  Target,
  ShieldCheck,
  MapPin,
  Camera,
  Copy,
  Check,
  ClipboardCheck,
  TrendingUp,
  Handshake,
  BedDouble,
  FileText,
  FileStack,
  RefreshCcw,
  GraduationCap,
  Hotel,
  Repeat,
  Scissors,
  Users,
  Star,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: () => ({ meta: [{ title: "Property — Deal Negotiator" }] }),
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery({ queryKey: ["property", params.id], queryFn: () => getProperty({ data: { id: params.id } }), staleTime: 30 * 1000 });
    void context.queryClient.prefetchQuery({ queryKey: ["personas"], queryFn: () => (listPersonas as any)(), staleTime: 5 * 60 * 1000 });
  },
  component: PropertyDetail,
});

const STRATEGY_META: Record<StrategyResult["key"], { short: string; icon: LucideIcon }> = {
  BTL: { short: "BTL", icon: Home },
  BRRR: { short: "BRRR", icon: RefreshCcw },
  SA: { short: "SA", icon: Hotel },
  HMO: { short: "HMO", icon: Users },
  FLIP: { short: "Flip", icon: Repeat },
  TITLE_SPLIT: { short: "Split", icon: Scissors },
};

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
  const persona = useMemo(
    () =>
      personas.find((p) => p.id === personaId) ?? personas.find((p) => p.is_default) ?? personas[0],
    [personas, personaId],
  );

  const { selected: lensSelected } = useStrategyFilter();
  const [over, setOver] = useState<SliderOverrides>({});
  const tune = (key: OverrideKey, value: number) => setOver((o) => ({ ...o, [key]: value }));
  const resetOne = (key: OverrideKey) =>
    setOver((o) => {
      const { [key]: _drop, ...rest } = o;
      return rest;
    });
  const resetAll = () => setOver({});
  const toggleSourcingBuffer = (enabled: boolean) =>
    setOver((o) =>
      enabled
        ? { ...o, sourcingBufferEnabled: true }
        : (() => {
            const { sourcingBufferEnabled: _drop, ...rest } = o;
            return rest;
          })(),
    );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const sectionProps = (key: string) => ({
    id: key,
    open: openSections[key] ?? true,
    onOpenChange: (v: boolean) => setOpenSections((s) => ({ ...s, [key]: v })),
  });

  // Draft overlay: local edits to refurb/EPC selections, seller context and survey findings take
  // effect on `analysis` immediately, without waiting for a save round-trip + refetch. Each panel
  // still debounce-persists to the DB in the background via its own mutation.
  const [draftRefurb, setDraftRefurb] = useState<any>(null);
  const [draftSellerContext, setDraftSellerContext] = useState<any>(null);
  const [draftSurveyFindings, setDraftSurveyFindings] = useState<any>(null);

  const effectiveProperty = useMemo(() => {
    if (!prop.data) return null;
    const pd = prop.data as any;
    return {
      ...pd,
      refurb_estimate: draftRefurb ?? pd.refurb_estimate,
      seller_context: draftSellerContext ?? pd.seller_context,
      survey_findings: draftSurveyFindings ?? pd.survey_findings,
    };
  }, [prop.data, draftRefurb, draftSellerContext, draftSurveyFindings]);

  const analysis = useMemo(() => {
    if (!effectiveProperty || !persona) return null;
    return analyseProperty(effectiveProperty as any, persona as any, over);
  }, [effectiveProperty, persona, over]);

  const updateMut = useMutation({
    mutationFn: (patch: any) => update({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property", id] }),
  });
  const [enrichUrl, setEnrichUrl] = useState("");
  const enrichMut = useMutation({
    mutationFn: (url: string) => enrich({ data: { propertyId: id, url } }),
    onSuccess: (r: any) => {
      toast.success(`Enriched: ${r.fieldsUpdated.length} fields, ${r.imageCount} images`);
      setEnrichUrl("");
      qc.invalidateQueries({ queryKey: ["property", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const [editingAsking, setEditingAsking] = useState(false);
  const [askingDraft, setAskingDraft] = useState("");
  const [pfJsonText, setPfJsonText] = useState("");
  const [heroOpenIndex, setHeroOpenIndex] = useState<number | null>(null);
  const [mobileCarouselIdx, setMobileCarouselIdx] = useState(0);
  const [activePanel, setActivePanel] = useState<"photos" | "library" | "enrich" | null>(null);
  const enrichJsonMut = useMutation({
    mutationFn: (json: string) => enrichJson({ data: { propertyId: id, json } }),
    onSuccess: (r: any) => {
      toast.success(`Enriched: ${r.fieldsUpdated.length} fields, ${r.totalImages} images`);
      setPfJsonText("");
      setActivePanel(null);
      qc.invalidateQueries({ queryKey: ["property", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const article4Mut = useMutation({
    mutationFn: (postcode: string) => lookupA4({ data: { postcode, propertyId: id } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["property", id] });
      if (r.status === "inside") {
        toast.warning(
          `Article 4 confirmed — ${r.areas.length} direction(s) found for ${r.postcode}. HMO strategy score has been adjusted.`,
        );
      } else {
        toast.success(
          `No Article 4 directions found for ${r.postcode} via the UK Planning Data API.`,
        );
      }
    },
    onError: (e: any) => toast.error(`Article 4 check failed: ${e.message}`),
  });

  if (prop.isLoading || personasQ.isLoading)
    return (
      <AppShell>
        <p className="text-muted-foreground">Loading…</p>
      </AppShell>
    );
  if (prop.error || personasQ.error) {
    const msg = (prop.error as any)?.message ?? (personasQ.error as any)?.message ?? "Unknown error";
    return (
      <AppShell>
        <div className="space-y-2">
          <p className="font-medium text-red-600">Couldn't load this property</p>
          <p className="text-sm text-muted-foreground">{msg}</p>
          <Button size="sm" variant="outline" onClick={() => { prop.refetch(); personasQ.refetch(); }}>
            Retry
          </Button>
        </div>
      </AppShell>
    );
  }
  if (!prop.data)
    return (
      <AppShell>
        <p>Property not found</p>
      </AppShell>
    );
  if (!persona)
    return (
      <AppShell>
        <div className="space-y-2">
          <p className="font-medium">No investor profile yet</p>
          <p className="text-sm text-muted-foreground">
            We couldn't load or create your investor profiles. Open the Personas page to create one, then come back.
          </p>
          <Link to="/persona"><Button size="sm">Open Personas</Button></Link>
        </div>
      </AppShell>
    );
  if (!analysis || !effectiveProperty)
    return (
      <AppShell>
        <p>Couldn't compute analysis for this property.</p>
      </AppShell>
    );

  const p = effectiveProperty as any;
  const eff = analysis.effectiveInputs;
  const inScopeStrategies = strategiesInScope(analysis.strategies, lensSelected);
  const bestInScope = bestOfSelected(analysis.strategies, lensSelected);
  const overallBest = analysis.strategies.find((s) => s.key === analysis.bestStrategy)!;
  const best = bestInScope ?? overallBest;
  const noLensFit = !bestInScope;
  const defaultStrategyTab = (
    inScopeStrategies.find((s) => s.key === best.key) ??
    inScopeStrategies[0] ??
    best
  ).key;
  const allImages: string[] = Array.isArray(p.image_urls) ? p.image_urls : [];
  const { photos: heroImagesRaw, floorPlans } = partitionImageUrls(allImages);
  const heroImages = Array.from(new Set(heroImagesRaw));
  const heroCarouselImages = heroImages.map((url) => ({ url }));

  return (
    <AppShell>
      <div className="mb-6">
        {/* Row 1: Address (left, flex-1) + Deal score (right-aligned) */}
        <div className="flex items-start gap-3">
          <h1 className="flex-1 text-2xl font-bold">
            {p.hide_address ? "Property (address hidden)" : p.address}
          </h1>
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            {/* Score number */}
            <div className={`text-2xl font-bold leading-none ${analysis.overallScore >= 60 ? "text-emerald-600" : analysis.overallScore >= 40 ? "text-amber-500" : "text-muted-foreground"}`}>
              {analysis.overallScore}
            </div>
            {/* Meter bar + label */}
            <div className="flex items-center gap-1.5">
              <div className="h-[10px] w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${analysis.overallScore >= 60 ? "bg-emerald-500" : analysis.overallScore >= 40 ? "bg-amber-500" : "bg-muted-foreground/60"}`}
                  style={{ width: `${Math.min(analysis.overallScore, 100)}%` }}
                />
              </div>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Deal score
                <DealScoreInfo
                  overallScore={analysis.overallScore}
                  breakdown={analysis.overallScoreBreakdown}
                  best={best}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Star | Investor (centred) | Eye toggle (right) */}
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => updateMut.mutate({ favourite: !p.favourite })}
            title={p.favourite ? "Unfavourite" : "Favourite"}
            className="shrink-0"
          >
            <Star className={`h-4 w-4 ${p.favourite ? "fill-amber-400 text-amber-400" : ""}`} />
          </Button>
          <div className="flex flex-1 justify-center">
            <Select value={persona.id} onValueChange={(v) => setPersonaId(v)}>
              <SelectTrigger className="h-8 w-auto min-w-[120px] max-w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {personas.map((pp) => (
                  <SelectItem key={pp.id} value={pp.id}>
                    {pp.name} {pp.is_default ? "★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            title={p.hide_address ? "Address hidden — click to reveal" : "Click to hide address"}
            onClick={() => {
              updateMut.mutate({ hide_address: !p.hide_address });
              toast.success(!p.hide_address ? "Address hidden" : "Address visible");
            }}
          >
            {p.hide_address
              ? <EyeOff className="h-5 w-5 text-red-600" strokeWidth={2.5} />
              : <Eye className="h-5 w-5 text-foreground" strokeWidth={2.5} />
            }
          </Button>
        </div>

        {/* Row 3: Action buttons */}
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:flex sm:flex-nowrap sm:items-center sm:overflow-x-auto">
          <Link to="/properties/$id/guide" params={{ id }}>
            <Button size="sm" variant="outline" className="w-full px-2 sm:w-auto sm:px-3" title="Guide">
              <GraduationCap className="h-4 w-4 sm:mr-2" />
              <span className="sm:inline">Guide</span>
            </Button>
          </Link>
          <Link to="/properties/$id/viewing" params={{ id }} search={{ tab: "before" }}>
            <Button size="sm" variant="outline" className="w-full px-2 sm:w-auto sm:px-3" title="Prepare">
              <ShieldCheck className="h-4 w-4 sm:mr-2" />
              <span className="sm:inline">Prepare</span>
            </Button>
          </Link>
          <Link to="/properties/$id/viewing" params={{ id }} search={{ tab: "capture" }}>
            <Button size="sm" variant="outline" className="w-full px-2 sm:w-auto sm:px-3" title="Capture">
              <Camera className="h-4 w-4 sm:mr-2" />
              <span className="sm:inline">Capture</span>
            </Button>
          </Link>
          <TalkingPointsButton
            guidance={analysis.negotiationGuidance}
            negotiation={analysis.negotiation}
            className="w-full sm:w-auto"
          />
        </div>

        {/* Row 4: Badges */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
          {p.baths && <Badge variant="outline">{p.baths} bath</Badge>}
          {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
          {p.epc_rate &&
            (p.epc_data?.certificateUrl ? (
              <a href={p.epc_data.certificateUrl} target="_blank" rel="noreferrer">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                  EPC {p.epc_rate} <ExternalLink className="ml-1 h-3 w-3" />
                </Badge>
              </a>
            ) : (
              <Badge variant="outline">EPC {p.epc_rate}</Badge>
            ))}
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
                    if (n > 0) {
                      updateMut.mutate({ asking_price_gbp: n });
                      setEditingAsking(false);
                    }
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
                onClick={() => {
                  const n = Number(askingDraft);
                  updateMut.mutate({ asking_price_gbp: n });
                  setEditingAsking(false);
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setEditingAsking(false)}
              >
                Cancel
              </Button>
            </span>
          ) : p.asking_price_gbp > 0 ? (
            <button
              type="button"
              onClick={() => {
                setAskingDraft(String(p.asking_price_gbp));
                setEditingAsking(true);
              }}
              title="Click to edit asking price"
            >
              <Badge className="cursor-pointer hover:opacity-80">
                {p.price_qualifier ? `${p.price_qualifier} ` : "Asking "}{fmtGBP(p.asking_price_gbp)} <PencilLine className="ml-1 h-3 w-3" />
              </Badge>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAskingDraft("");
                setEditingAsking(true);
              }}
              title="Asking price is missing — click to enter it"
            >
              <Badge
                variant="outline"
                className="cursor-pointer border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
              >
                <AlertTriangle className="mr-1 h-3 w-3" /> Set asking price
              </Badge>
            </button>
          )}
          {p.article4_status === "inside" && (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">
              Article 4 — inside
            </Badge>
          )}
          {p.article4_status === "partial" && (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">
              Article 4 — partial
            </Badge>
          )}
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
              {article4Mut.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <MapPin className="mr-1 h-3 w-3" />
              )}
              {p.article4_status ? "Re-check Article 4" : "Check Article 4"}
            </Button>
          )}
          {p.source_link && (
            <a
              href={p.source_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> View listing
            </a>
          )}
        </div>

        {/* Row 5: Risk chips */}
        {analysis.riskFlags && analysis.riskFlags.length > 0 && (
          <div className="mt-2">
            <RiskChips flags={analysis.riskFlags as any} />
          </div>
        )}
      </div>

      <OfferPlanCard
        section={sectionProps("offer-plan")}
        propertyId={id}
        setOpenSections={setOpenSections}
        onOpenRefurb={() => {
          setOpenSections((s) => ({ ...s, "refurb-epc": true }));
          requestAnimationFrame(() => {
            document
              .getElementById("refurb-epc")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
        analysis={analysis}
        best={best}
        guidance={analysis.negotiationGuidance}
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

      {heroImages.length > 0 && (
        <CollapsibleCard
          {...sectionProps("photos")}
          className="mb-3"
          icon={<Camera className="h-4 w-4 text-accent" />}
          title="Photos"
          summary={`${heroImages.length} photo${heroImages.length === 1 ? "" : "s"}`}
          actions={<FeedbackWidget propertyId={id} sectionKey="photos" sectionLabel="Photos" />}
        >
          {/* Mobile carousel */}
          <div className="-mx-6 -mt-4 sm:hidden">
            <div className="relative overflow-hidden">
              <button
                className="block w-full"
                onClick={() => setHeroOpenIndex(mobileCarouselIdx)}
              >
                <img
                  src={heroImages[mobileCarouselIdx]}
                  alt=""
                  className="h-64 w-full object-cover"
                />
              </button>
              {mobileCarouselIdx > 0 && (
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow animate-pulse"
                  onClick={() => setMobileCarouselIdx((i) => i - 1)}
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {mobileCarouselIdx < heroImages.length - 1 && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow animate-pulse"
                  onClick={() => setMobileCarouselIdx((i) => i + 1)}
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              <div className="absolute bottom-1 right-2 rounded bg-background/70 px-1.5 py-0.5 text-[11px] text-foreground">
                {mobileCarouselIdx + 1} / {heroImages.length}
              </div>
            </div>
            {/* Thumbnail strip */}
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
              {heroImages.map((u, i) => (
                <button
                  key={i}
                  onClick={() => setMobileCarouselIdx(i)}
                  className={cn(
                    "h-14 w-14 shrink-0 overflow-hidden rounded",
                    i === mobileCarouselIdx
                      ? "ring-2 ring-primary"
                      : Math.abs(i - mobileCarouselIdx) === 1
                        ? "ring-2 ring-muted-foreground/50"
                        : "opacity-60",
                  )}
                >
                  <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>

          {/* Desktop grid */}
          <div className="-mx-6 -mt-4 hidden overflow-hidden rounded-md sm:mx-0 sm:mt-0 sm:block">
            <div className="grid grid-cols-4 gap-1">
              <button
                className="col-span-4 sm:col-span-2 sm:row-span-2"
                onClick={() => setHeroOpenIndex(0)}
              >
                <img
                  src={heroImages[0]}
                  alt=""
                  className="h-full max-h-[360px] w-full object-cover transition hover:opacity-90"
                />
              </button>
              {heroImages.slice(1, 5).map((u, i) => (
                <button key={i} onClick={() => setHeroOpenIndex(i + 1)}>
                  <img
                    src={u}
                    alt=""
                    className="h-32 w-full object-cover transition hover:opacity-90 sm:h-[178px]"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <button
                onClick={() => setHeroOpenIndex(0)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Images className="h-3.5 w-3.5" /> View fullscreen — browse all {heroImages.length}{" "}
                photos
              </button>
              {heroImages.length > 5 && (
                <button
                  onClick={() => setActivePanel("library")}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  +{heroImages.length - 5} more — open in image library
                </button>
              )}
            </div>
          </div>
        </CollapsibleCard>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => setActivePanel("photos")}
          className="flex min-w-[150px] shrink-0 flex-col rounded-md border p-3 text-left transition hover:bg-muted/40"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Camera className="h-4 w-4 text-muted-foreground" /> Photos
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">AI condition scan</p>
        </button>
        <button
          onClick={() => setActivePanel("library")}
          className="flex min-w-[150px] shrink-0 flex-col rounded-md border p-3 text-left transition hover:bg-muted/40"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Images className="h-4 w-4 text-muted-foreground" /> Image library
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {heroImages.length} photo{heroImages.length === 1 ? "" : "s"}, by room
          </p>
        </button>
        <button
          onClick={() => setActivePanel("enrich")}
          className="flex min-w-[150px] shrink-0 flex-col rounded-md border p-3 text-left transition hover:bg-muted/40"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-muted-foreground" /> Enrich listing
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">Details, images, PF JSON</p>
        </button>
      </div>

      <ImageCarousel
        images={heroCarouselImages}
        index={heroOpenIndex}
        onIndexChange={setHeroOpenIndex}
        onClose={() => setHeroOpenIndex(null)}
      />

      {floorPlans.length > 0 && (
        <CollapsibleCard
          {...sectionProps("floorplans")}
          className="mb-3"
          icon={<FileStack className="h-4 w-4 text-accent" />}
          title={`Floor plan${floorPlans.length > 1 ? "s" : ""}`}
          summary={`${floorPlans.length} floor plan${floorPlans.length === 1 ? "" : "s"}`}
          actions={
            <FeedbackWidget propertyId={id} sectionKey="floorplans" sectionLabel="Floorplans" />
          }
        >
          <div className={cn("grid gap-3", floorPlans.length > 1 ? "sm:grid-cols-2" : "")}>
            {floorPlans.map((u, i) => (
              <a
                key={i}
                href={u}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-md border bg-muted/40"
              >
                <img
                  src={u}
                  alt="Floor plan"
                  className="h-[320px] w-full object-contain p-2"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {floorPlans.length > 0 && (
        <CollapsibleCard
          {...sectionProps("hmo-layout")}
          className="mb-3"
          icon={<BedDouble className="h-4 w-4 text-accent" />}
          title="HMO / SA layout assessment"
          summary="Room-by-room conversion feasibility"
          actions={
            <FeedbackWidget propertyId={id} sectionKey="hmo-layout" sectionLabel="HMO Layout" />
          }
        >
          <HmoLayoutPanel
            propertyId={id}
            hasFloorPlan={floorPlans.length > 0}
            hmoConversion={analysis.strategies.find((s) => s.key === "HMO")?.conversionOptions}
            saConversion={analysis.strategies.find((s) => s.key === "SA")?.conversionOptions}
          />
        </CollapsibleCard>
      )}

      <Dialog
        open={activePanel === "photos"}
        onOpenChange={(o) => setActivePanel(o ? "photos" : null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-8">
            <DialogTitle>Photos</DialogTitle>
            <FeedbackWidget propertyId={id} sectionKey="photos-scan" sectionLabel="AI Photo Scan" />
          </DialogHeader>
          <PhotosPanel propertyId={id} listingImageCount={heroImages.length} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={activePanel === "library"}
        onOpenChange={(o) => setActivePanel(o ? "library" : null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-8">
            <DialogTitle>Image library</DialogTitle>
            <FeedbackWidget
              propertyId={id}
              sectionKey="image-library"
              sectionLabel="Image Library"
            />
          </DialogHeader>
          <ImageLibrary propertyId={id} urls={heroImages} defaultExpanded />
        </DialogContent>
      </Dialog>

      <Dialog
        open={activePanel === "enrich"}
        onOpenChange={(o) => setActivePanel(o ? "enrich" : null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-8">
            <DialogTitle>Enrich from listing URL</DialogTitle>
            <FeedbackWidget
              propertyId={id}
              sectionKey="enrich-listing"
              sectionLabel="Enrich Listing"
            />
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="https://www.rightmove.co.uk/properties/..."
              value={enrichUrl}
              onChange={(e) => setEnrichUrl(e.target.value)}
              className="h-8 flex-1 min-w-[260px]"
            />
            <Button
              size="sm"
              disabled={!enrichUrl || enrichMut.isPending}
              onClick={() => enrichMut.mutate(enrichUrl)}
            >
              {enrichMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Home className="mr-2 h-4 w-4" />
              )}
              Pull details + images
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Supports Rightmove, Zoopla, OnTheMarket, Boomin, PrimeLocation. Requires Firecrawl in
            Connectors.
          </p>
          <div className="border-t pt-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <FileJson className="h-4 w-4" /> Paste PF JSON
            </p>
            <p className="mb-2 text-sm text-muted-foreground">
              Paste the full JSON object from Property Filter. Existing fields are kept; only
              missing fields are filled. New image URLs are appended.
            </p>
            <Textarea
              value={pfJsonText}
              onChange={(e) => setPfJsonText(e.target.value)}
              placeholder='{"propertyLight":{...},"propertyDetail":{...}}'
              className="h-48 font-mono text-xs"
            />
            <Button
              className="mt-2"
              onClick={() => enrichJsonMut.mutate(pfJsonText)}
              disabled={!pfJsonText.trim() || enrichJsonMut.isPending}
            >
              {enrichJsonMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enrich now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {!analysis.personaMatch.pass && (
        <Card className="mb-3 border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-medium text-amber-900">Investor criteria mismatch</p>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                {analysis.personaMatch.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {noLensFit && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex items-start gap-3 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
              <p className="text-sm text-amber-900">
                No selected strategy in your lens is feasible for this property. Showing the overall
                best strategy ({best.name}) instead — adjust the strategy lens in the top nav to
                broaden the view.
              </p>
            </CardContent>
          </Card>
        )}

        <CollapsibleCard
          {...sectionProps("refurb-epc")}
          icon={<Wrench className="h-4 w-4 text-accent" />}
          title="Refurb & EPC"
          summary={`Refurb ${fmtGBP(p.refurb_estimate?.total ?? 0)} · EPC ${p.epc_rate ?? "not fetched"}`}
          actions={
            <FeedbackWidget propertyId={id} sectionKey="refurb-epc" sectionLabel="Refurb & EPC" />
          }
        >
          <RefurbEpcPanel
            propertyId={id}
            property={p}
            hasAnyPhotos={heroImages.length > 0}
            onLiveChange={setDraftRefurb}
          />
        </CollapsibleCard>

        <CollapsibleCard
          {...sectionProps("survey")}
          icon={<ClipboardCheck className="h-4 w-4 text-accent" />}
          title="Survey & condition leverage"
          summary={(() => {
            const { totalLeverage, flaggedCount } = computeSurveyLeverage(p);
            return `${flaggedCount} flagged · −${fmtGBP(totalLeverage)} confirmed`;
          })()}
          actions={
            <FeedbackWidget propertyId={id} sectionKey="survey" sectionLabel="Survey Findings" />
          }
        >
          <SurveyStrategyPanel property={p} onLiveChange={setDraftSurveyFindings} />
        </CollapsibleCard>

        <CollapsibleCard
          {...sectionProps("negotiation-playbook")}
          icon={<Sparkles className="h-4 w-4 text-accent" />}
          title="Negotiation playbook"
          summary={`−${fmtGBP(analysis.negotiationTotal)} weighted leverage across ${analysis.negotiation.filter((n) => n.gbp_impact > 250).length} points`}
          actions={
            <FeedbackWidget
              propertyId={id}
              sectionKey="negotiation-playbook"
              sectionLabel="Negotiation Playbook"
            />
          }
        >
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Weighted evidence to take to the agent. Full costs are shown where useful, but only
              the defensible share is counted into the offer.
            </p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Fully applied — 100% in the offer
              </span>
              <span className="flex items-center gap-1.5 rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Partially applied — defensible share only
              </span>
              <span className="flex items-center gap-1.5 rounded px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" /> Minimally applied — soft signal
              </span>
            </div>
            {analysis.negotiation
              .filter((n) => n.gbp_impact > 250)
              .map((n, i) => {
                const usageKey = n.confidence;
                const usage = usageKey === "high"
                  ? { border: "border-l-4 border-l-emerald-500", badgeCls: "bg-emerald-50 text-emerald-700 border border-emerald-200", label: "Fully applied", note: null }
                  : usageKey === "medium"
                  ? { border: "border-l-4 border-l-amber-400", badgeCls: "bg-amber-50 text-amber-700 border border-amber-200", label: "Partially applied", note: "Defensible share only — the full cost is held back as reserve for counter-offer or survey stage." }
                  : { border: "border-l-4 border-l-orange-400", badgeCls: "bg-orange-50 text-orange-700 border border-orange-200", label: "Minimally applied", note: "Soft signal only — survey or quote evidence is needed before this can be claimed in full." };
                return (
                  <CollapsibleCard
                    key={i}
                    variant="plain"
                    defaultOpen={false}
                    title={n.title}
                    summary={n.description}
                    className={usage.border}
                    actions={
                      <div className="flex items-center gap-2">
                        <span className={`hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline ${usage.badgeCls}`}>{usage.label}</span>
                        <Badge variant="outline" className="hidden text-[10px] capitalize sm:inline-flex">
                          {n.category.replace("_", " ")}
                        </Badge>
                        <span className="font-bold text-primary">−{fmtGBP(n.gbp_impact)}</span>
                      </div>
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${usage.badgeCls}`}>{usage.label}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {n.category.replace("_", " ")}
                      </Badge>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {n.confidence} confidence
                      </span>
                      {n.title.startsWith("Survey:") && (
                        <JumpLink to="survey" setOpenSections={setOpenSections}>
                          Survey
                        </JumpLink>
                      )}
                      {n.title.includes("EPC") && (
                        <JumpLink to="refurb-epc" setOpenSections={setOpenSections}>
                          EPC
                        </JumpLink>
                      )}
                    </div>
                    {usage.note && (
                      <p className="mt-1 text-[11px] italic text-muted-foreground">{usage.note}</p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground">{n.description}</p>
                    {n.specOptions && n.specOptions.length > 0 && (
                      <div className="mt-2">
                        <SpecOptionsRow options={n.specOptions} />
                      </div>
                    )}
                  </CollapsibleCard>
                );
              })}
            {analysis.negotiation.some((n) => n.gbp_impact <= 250) && (
              <TooltipProvider delayDuration={120}>
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed p-2.5">
                  <span className="mr-1 text-xs text-muted-foreground">Also factored in (minimally applied):</span>
                  {analysis.negotiation
                    .filter((n) => n.gbp_impact <= 250)
                    .map((n, i) => (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="cursor-default gap-1 border-orange-200 bg-orange-50 text-xs font-normal text-orange-700"
                          >
                            {n.title}{" "}
                            <span className="font-semibold">
                              −{fmtGBP(n.gbp_impact)}
                            </span>
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[300px] text-xs">
                          <p className="font-medium text-orange-700">Minimally applied</p>
                          <p>{n.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                </div>
              </TooltipProvider>
            )}
            {analysis.negotiationGuidance.retainedLeverage > 0 && (
              <div className="flex items-start gap-2.5 rounded-md border border-dashed border-muted-foreground/40 p-2.5">
                <div className="mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-muted-foreground/50 bg-muted" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Not in opening offer — held in reserve:{" "}
                    <span className="font-bold text-foreground">
                      {fmtGBP(analysis.negotiationGuidance.retainedLeverage)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    The evidence total exceeds the credible opening range for a{" "}
                    {analysis.negotiationGuidance.priceBand} property (capped at{" "}
                    {fmtPct(analysis.negotiationGuidance.credibleDiscountPct)} of asking). This
                    reserve is deployed at survey stage or counter-offer — not thrown into the
                    first bid.
                  </p>
                </div>
              </div>
            )}
            {!p.ai_payload?.landlordReadiness && (
              <p className="text-xs text-muted-foreground">
                Run AI photo analysis (Photos &amp; AI condition report, above) to also factor
                white-goods and garden-clearance costs into this offer.
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
                  {analysis.negotiationGuidance.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          {...sectionProps("smart-negotiation")}
          icon={<Handshake className="h-4 w-4 text-accent" />}
          title="Smart negotiation"
          summary={`Open ${fmtGBP(analysis.negotiationGuidance.openingOffer)} · Target ${fmtGBP(analysis.negotiationGuidance.targetOffer)}`}
          actions={
            <FeedbackWidget
              propertyId={id}
              sectionKey="smart-negotiation"
              sectionLabel="Smart Negotiation"
            />
          }
        >
          <NegotiationPanel
            property={p}
            guidance={analysis.negotiationGuidance}
            onLiveChange={setDraftSellerContext}
          />
        </CollapsibleCard>

        <CollapsibleCard
          {...sectionProps("strategy-comparison")}
          icon={<Target className="h-4 w-4 text-accent" />}
          title="Strategy comparison"
          summary={`Best: ${best.name} · ${best.dealScore}/100`}
          actions={
            <div className="flex items-center gap-1">
              {Object.keys(over).length > 0 && (
                <Button variant="outline" size="sm" onClick={resetAll}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset all tuning
                </Button>
              )}
              <FeedbackWidget
                propertyId={id}
                sectionKey="strategy-comparison"
                sectionLabel="Strategy Comparison"
              />
            </div>
          }
        >
          <p className="mb-3 text-sm text-muted-foreground">
            Numbers start from the negotiation playbook, AI surveyor findings and refurb estimator —
            drag any tunable cell's slider to flex it and watch the rest ripple through.
          </p>
          <Tabs defaultValue={defaultStrategyTab}>
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6">
              {inScopeStrategies.map((s) => {
                const meta = STRATEGY_META[s.key];
                const Icon = meta.icon;
                return (
                  <TabsTrigger
                    key={s.key}
                    value={s.key}
                    title={s.name}
                    className="flex flex-col items-center gap-0.5 px-1 py-2 text-xs"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{meta.short}</span>
                    <span className="text-[10px] opacity-60">{s.dealScore}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {inScopeStrategies.map((s) => (
              <TabsContent key={s.key} value={s.key} className="pt-4">
                <StrategyView s={s} onTune={tune} onReset={resetOne} />
              </TabsContent>
            ))}
          </Tabs>
        </CollapsibleCard>

        {p.pf_json && (
          <CollapsibleCard
            {...sectionProps("pf-signals")}
            icon={<ClipboardCheck className="h-4 w-4 text-accent" />}
            title="Property Filter signals"
            summary={
              p.pf_json.propertyLight?.lastSold
                ? `Last sold ${fmtGBP(p.pf_json.propertyLight.lastSold.value)} (${new Date(p.pf_json.propertyLight.lastSold.date).getFullYear()})`
                : p.pf_json.propertyLight?.equity != null
                  ? `Seller equity ${fmtPct(p.pf_json.propertyLight.equity)}`
                  : "Listing signals"
            }
            actions={
              <div className="flex items-center gap-2">
                {p.source_link && (
                  <a
                    href={p.source_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View listing
                  </a>
                )}
                <FeedbackWidget propertyId={id} sectionKey="pf-signals" sectionLabel="PF Signals" />
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {p.pf_json.propertyLight?.lastSold && (
                <Stat
                  label="Last sold"
                  v={`${fmtGBP(p.pf_json.propertyLight.lastSold.value)} (${new Date(p.pf_json.propertyLight.lastSold.date).getFullYear()})`}
                />
              )}
              {p.pf_json.propertyLight?.equity != null && (
                <Stat label="Seller equity" v={fmtPct(p.pf_json.propertyLight.equity)} />
              )}
              {p.pf_json.propertyLight?.article4Status && (
                <Stat label="Article 4" v={p.pf_json.propertyLight.article4Status} />
              )}
              {p.pf_json.propertyLight?.councilTax && (
                <Stat label="Council tax" v={p.pf_json.propertyLight.councilTax} />
              )}
              {p.pf_json.propertyLight?.multipleReduce != null && (
                <Stat label="Reductions" v={String(p.pf_json.propertyLight.multipleReduce)} />
              )}
              {p.pf_json.propertyLight?.multipleBack != null && (
                <Stat label="Back-on-market" v={String(p.pf_json.propertyLight.multipleBack)} />
              )}
              {(p.pf_json.propertyLight?.daysOnMarket ?? p.pf_json.propertyLight?.totalDays) != null && (
                <Stat
                  label="Days on market"
                  v={`${p.pf_json.propertyLight?.daysOnMarket ?? p.pf_json.propertyLight?.totalDays} days`}
                />
              )}
            </div>
            <PriceHistoryTimeline property={p} />
          </CollapsibleCard>
        )}

        {(() => {
            const marketData = p.pf_json
              ? extractMarketDataFromPfJson(p.pf_json?.propertyLight ?? {}, p.pf_json?.propertyDetail ?? {})
              : null;
            const soldComparables = marketData?.soldComparables ?? [];
            return (
              <CollapsibleCard
                {...sectionProps("market-comparables")}
                icon={<TrendingUp className="h-4 w-4 text-accent" />}
                title="Market comparables"
                summary={
                  soldComparables.length > 0
                    ? `${soldComparables.length} comparable${soldComparables.length === 1 ? "" : "s"}`
                    : undefined
                }
                actions={
                  <FeedbackWidget
                    propertyId={id}
                    sectionKey="market-comparables"
                    sectionLabel="Market Comparables"
                  />
                }
              >
                <MarketComparablesPanel propertyId={p.id} pf_json={p.pf_json} askingPrice={p.asking_price_gbp} />
              </CollapsibleCard>
            );
          })()}

        <CollapsibleCard
          {...sectionProps("deal-sheet")}
          icon={<FileText className="h-4 w-4 text-accent" />}
          title="Deal sheet"
          summary="Shareable PDF / link"
          actions={
            <FeedbackWidget propertyId={id} sectionKey="deal-sheet" sectionLabel="Deal Sheet" />
          }
        >
          <DealSheetPanel
            propertyId={id}
            overrides={over}
            personaId={persona.id}
            personaName={persona.name}
          />
        </CollapsibleCard>
      </div>
    </AppShell>
  );
}

function TalkingPointsButton({
  guidance,
  negotiation,
  className,
}: {
  guidance: NegotiationGuidance;
  negotiation: NegotiationPoint[];
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const script = useMemo(
    () => buildTalkingPointsScript(guidance, negotiation),
    [guidance, negotiation],
  );

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
        <Button size="sm" variant="outline" className={cn("px-2 sm:px-3", className)} title="Negotiate">
          <Handshake className="h-4 w-4 sm:mr-2" />
          <span className="sm:inline">Negotiate</span>
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
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap p-3 text-xs leading-relaxed text-muted-foreground">
          {script}
        </pre>
      </PopoverContent>
    </Popover>
  );
}

function OfferPlanCard({
  section,
  propertyId,
  setOpenSections,
  onOpenRefurb,
  analysis,
  best,
  guidance,
  personaPass,
  sourcingBufferEnabled,
  onToggleSourcingBuffer,
  arv,
  arvOverridden,
  sourcingProfitPct,
  sourcingFeeGbp,
  onTune,
  onResetOne,
}: {
  section: { id: string; open: boolean; onOpenChange: (open: boolean) => void };
  propertyId: string;
  setOpenSections: Dispatch<SetStateAction<Record<string, boolean>>>;
  onOpenRefurb: () => void;
  analysis: AnalysisOutput;
  best: StrategyResult;
  guidance: NegotiationGuidance;
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
  const discount =
    guidance.askingPrice > 0
      ? (guidance.askingPrice - guidance.targetOffer) / guidance.askingPrice
      : 0;
  const sb = guidance.sourcingBuffer;
  const eq = guidance.equityPlan;
  return (
    <CollapsibleCard
      {...section}
      className="mb-3 border-primary/30 bg-primary/[0.03]"
      icon={<Target className="h-4 w-4 text-primary" />}
      title={
        <span className="flex items-center gap-2">
          Offer plan
          <FormulaInfo
            title="Full target deal price calculation"
            intro="How the model gets from asking price to the three offer figures."
            rows={[
              { label: "Asking price", value: fmtGBP(guidance.askingPrice) },
              {
                label: `Total leverage evidence (${analysis.negotiation.length} signals)`,
                value: `−${fmtGBP(guidance.fullLeverage)}`,
                hint: (
                  <JumpLink to="negotiation-playbook" setOpenSections={setOpenSections}>
                    View colour-coded breakdown
                  </JumpLink>
                ),
              },
              guidance.fullLeverage > guidance.askingPrice * guidance.credibleDiscountPct
                ? {
                    label: `Credible cap for ${guidance.priceBand}`,
                    value: `max −${fmtGBP(Math.round(guidance.askingPrice * guidance.credibleDiscountPct))} (${(guidance.credibleDiscountPct * 100).toFixed(1)}% of asking)`,
                    hint: `Evidence exceeds credible opening range — ${fmtGBP(guidance.retainedLeverage)} held back as reserve`,
                  }
                : {
                    label: `Credible cap for ${guidance.priceBand}`,
                    value: `within ${(guidance.maxOpeningDiscountPct * 100).toFixed(1)}% credible range`,
                  },
              {
                label: "Applied leverage (asking → target)",
                value: `−${fmtGBP(guidance.appliedLeverage)}`,
                hint: guidance.retainedLeverage > 0
                  ? `${fmtGBP(guidance.retainedLeverage)} retained for survey / counter-offer`
                  : undefined,
              },
              {
                label: "= Target deal price",
                value: `${fmtGBP(guidance.targetOffer)} (${fmtPct(guidance.askingPrice > 0 ? (guidance.askingPrice - guidance.targetOffer) / guidance.askingPrice : 0)} below asking)`,
              },
              {
                label: "Opening bid",
                value: fmtGBP(guidance.openingOffer),
                hint: guidance.targetOffer > guidance.openingOffer
                  ? `${fmtPct((guidance.targetOffer - guidance.openingOffer) / guidance.targetOffer)} below target — starting anchor, not the deal price`
                  : undefined,
              },
              {
                label: "Walk-away ceiling",
                value: fmtGBP(guidance.walkAwayOffer),
                hint: guidance.walkAwayOffer > guidance.targetOffer
                  ? `${fmtPct((guidance.walkAwayOffer - guidance.targetOffer) / guidance.targetOffer)} above target — do not pay more than this`
                  : undefined,
              },
              {
                label: "Stance",
                value: `${guidance.stance.replace("-", " ")} · ${guidance.priceBand}`,
              },
              {
                label: "Equity target",
                value: eq ? fmtPct(eq.targetEquityPct) : "—",
                hint: eq ? (
                  <JumpLink to="equity-check" setOpenSections={setOpenSections}>
                    View equity check
                  </JumpLink>
                ) : undefined,
              },
            ]}
          />
        </span>
      }
      summary={`Target ${fmtGBP(guidance.targetOffer)} · ${guidance.stance.replace("-", " ")} stance${eq ? ` · ${fmtPct(eq.equityPctAtTarget)} equity` : ""}`}
      actions={
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Recalculate offer price from current refurb, EPC and seller-context selections"
            onClick={(e) => {
              e.stopPropagation();
              onResetOne("offer_price");
              onResetOne("refurb_cost");
              toast.success("Offer price recalculated from current selections");
            }}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
          <FeedbackWidget
            propertyId={propertyId}
            sectionKey="offer-plan"
            sectionLabel="Offer Plan"
          />
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {best.name}: {best.summary}
        </p>
        <DealIndicators indicators={analysis.dealIndicators} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-md bg-muted/50 p-2.5 cursor-default">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Opening bid</p>
                  <p className="font-medium">{fmtGBP(guidance.openingOffer)}</p>
                  {guidance.targetOffer > guidance.openingOffer && (
                    <p className="mt-0.5 text-[10px] font-medium text-emerald-700">
                      {fmtPct((guidance.targetOffer - guidance.openingOffer) / guidance.targetOffer)} below target
                    </p>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-xs">
                Starting anchor — open here, framed around the evidenced case. This is{" "}
                {guidance.targetOffer > guidance.openingOffer
                  ? `${fmtPct((guidance.targetOffer - guidance.openingOffer) / guidance.targetOffer)} below your target deal price of ${fmtGBP(guidance.targetOffer)}.`
                  : "at or above the target."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Stat label="Target deal price" v={fmtGBP(guidance.targetOffer)} />
          <div className="rounded-md bg-muted/50 p-2.5">
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Walk-away ceiling
              </p>
              <OfferFloorInfo guidance={guidance} />
            </div>
            <p className="font-medium">{fmtGBP(guidance.walkAwayOffer)}</p>
            {guidance.walkAwayOffer > guidance.targetOffer && (
              <p className="mt-0.5 text-[10px] font-medium text-amber-700">
                {fmtPct((guidance.walkAwayOffer - guidance.targetOffer) / guidance.targetOffer)} above target
              </p>
            )}
          </div>
          <Stat label="Discount at target" v={fmtPct(discount)} />
          <button type="button" onClick={onOpenRefurb} className="text-left">
            <Stat label="Refurb + improvement cost" v={fmtGBP(analysis.effectiveInputs.refurb_cost)} />
          </button>
          <div className="rounded-md bg-muted/50 p-2.5">
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Insurance (est.)
              </p>
              <InsuranceInfo insurance={analysis.insurance} />
            </div>
            <p className="font-medium">{fmtGBP(analysis.insurance.annualPremiumGbp)}/yr</p>
          </div>
        </div>
        {eq && (
          <div className="rounded-md bg-muted/50 p-2.5">
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Built-in equity at target offer
              </p>
              <Badge className={eq.meetsTarget ? "bg-emerald-600" : "bg-amber-600"}>
                {eq.meetsTarget ? "Meets 25% target" : "Below 25% target"}
              </Badge>
            </div>
            <p className="font-medium">
              {fmtGBP(eq.equityAtTarget)} ({fmtPct(eq.equityPctAtTarget)} of GDV)
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="capitalize">
            {guidance.stance.replace("-", " ")}
          </Badge>
          <Badge variant="outline">{guidance.priceBand}</Badge>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Underwriting uses the target price, not the lower opening anchor.
          </span>
          {!personaPass && (
            <span className="text-amber-700">
              Current investor criteria do not fully fit this property.
            </span>
          )}
        </div>
        {guidance.epcToCCost != null && (
          <p className="text-xs text-muted-foreground">
            EPC-to-C spend (~{fmtGBP(guidance.epcToCCost)}) is partly baked into the walk-away
            ceiling above — required to let from 2030 under MEES rules.{" "}
            <JumpLink to="epc" setOpenSections={setOpenSections}>
              EPC details
            </JumpLink>
          </p>
        )}
        {eq && (
          <CollapsibleCard
            variant="plain"
            defaultOpen={false}
            id="equity-check"
            title="Equity check (target offer)"
            summary={`${eq.meetsTarget ? "Meets" : "Below"} ${fmtPct(eq.targetEquityPct)} target — ${fmtGBP(eq.equityAtTarget)} built-in equity (${fmtPct(eq.equityPctAtTarget)} of GDV)`}
            className="bg-background/60"
          >
            <p className="text-xs text-muted-foreground">
              GDV {fmtGBP(eq.gdv)} − offer {fmtGBP(guidance.targetOffer)} − refurb{" "}
              <button
                type="button"
                onClick={onOpenRefurb}
                className="font-medium text-primary hover:underline"
              >
                {fmtGBP(eq.refurbCost)}
              </button>{" "}
              − acquisition costs {fmtGBP(eq.acquisitionCosts)} (SDLT + legal/survey) leaves{" "}
              {fmtGBP(eq.equityAtTarget)} built-in equity ({fmtPct(eq.equityPctAtTarget)} of GDV).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The {fmtPct(eq.targetEquityPct)} target gives a 75% LTV BRRR refinance enough headroom
              to return most/all capital, and gives a flip ~{fmtPct(eq.targetEquityPct)} of GDV to
              cover buy/hold/sell costs (~10%) plus genuine profit.
            </p>
            {!eq.meetsTarget && (
              <p className="mt-2 text-xs text-amber-700">
                To hit {fmtPct(eq.targetEquityPct)} equity, the offer would need to come down to
                around {fmtGBP(eq.maxOfferForTargetEquity)} (or the refurb scope/GDV would need to
                improve).
              </p>
            )}
          </CollapsibleCard>
        )}
        <div className="rounded-md border bg-background/60 p-3">
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
                  {!arvOverridden && (
                    <span className="text-[10px] uppercase text-muted-foreground">
                      est. (offer × 1.18)
                    </span>
                  )}
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
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Set this to a comparable-evidenced post-refurb valuation, not the asking price.
                </p>
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
      </div>
    </CollapsibleCard>
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
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tracked price history
        </p>
        {totalChange !== 0 && (
          <span
            className={cn(
              "text-xs font-medium",
              totalChange < 0 ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {totalChange < 0 ? "−" : "+"}
            {fmtGBP(Math.abs(totalChange))} since {fmtHistoryDate(oldest.date)}
          </span>
        )}
      </div>
      <ul className="space-y-1 text-sm">
        {history.map((h, i) => (
          <li key={`${h.date}-${h.value}`} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {fmtHistoryDate(h.date)}
              {i === 0 && (
                <Badge variant="outline" className="ml-2 h-5 text-[10px]">
                  current
                </Badge>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-medium">{fmtGBP(h.value)}</span>
              {h.changeFromPrevious != null && h.changeFromPrevious !== 0 && (
                <span
                  className={cn(
                    "text-xs",
                    h.changeFromPrevious < 0 ? "text-emerald-700" : "text-amber-700",
                  )}
                >
                  ({h.changeFromPrevious < 0 ? "−" : "+"}
                  {fmtGBP(Math.abs(h.changeFromPrevious))})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Expands the target collapsible section (if collapsed) and scrolls it into view —
 *  used to make derived figures click-through to the section that explains them. */
function JumpLink({
  to,
  setOpenSections,
  children,
}: {
  to: string;
  setOpenSections: Dispatch<SetStateAction<Record<string, boolean>>>;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
      onClick={() => {
        setOpenSections((s) => ({ ...s, [to]: true }));
        requestAnimationFrame(() => {
          document.getElementById(to)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }}
    >
      {children} <ArrowRight className="h-3 w-3" />
    </button>
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
  return n.format === "gbp"
    ? fmtGBP(n.value)
    : n.format === "pct"
      ? fmtPct(n.value)
      : n.format === "months"
        ? `${fmtNum(n.value)} mo`
        : n.format === "count"
          ? fmtNum(Math.round(n.value), 0)
          : fmtNum(n.value, 2);
}

// Reasons that stem from the *numbers* (cash needed, DSCR, margin, ARV headroom) — i.e. the kind a
// slider tweak can cause or cure. Structural blockers (Article 4, licensing, leasehold, risk flags,
// title-split eligibility) are not "fixable" by nudging a slider back, so they're excluded.
const TUNABLE_CONSTRAINT_RE = /cash in|dscr|margin|profit|arv \(|exceed/i;

function StrategyView({
  s,
  onTune,
  onReset,
}: {
  s: StrategyResult;
  onTune: (key: OverrideKey, v: number) => void;
  onReset: (key: OverrideKey) => void;
}) {
  const overridden = s.numbers.filter((n) => n.overrideKey && n.overridden);
  const overriddenKeys = Array.from(new Set(overridden.map((n) => n.overrideKey as OverrideKey)));
  const overriddenLabels = Array.from(new Set(overridden.map((n) => n.label)));
  const breakingReasons = (s.reasons ?? []).filter((r) => TUNABLE_CONSTRAINT_RE.test(r));
  const brokenByTuning = !s.feasible && overriddenKeys.length > 0 && breakingReasons.length > 0;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{s.name}</h3>
      <div className="flex items-center gap-2">
        {s.feasible ? (
          <CheckCircle2 className="h-5 w-5 text-primary" />
        ) : (
          <XCircle className="h-5 w-5 text-amber-600" />
        )}
        <p className="text-sm">{s.summary}</p>
      </div>
      {s.reasons && s.reasons.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">Watch outs</p>
          <ul className="list-inside list-disc">
            {s.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {brokenByTuning && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  That combination isn't realistic
                </p>
                <p className="mt-0.5 text-xs text-destructive/80">
                  You've moved <span className="font-medium">{overriddenLabels.join(", ")}</span>{" "}
                  away from what the negotiation playbook, AI surveyor and refurb estimator computed
                  — and at these settings the maths below say this strategy no longer stacks up:
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="shrink-0"
              onClick={() => overriddenKeys.forEach(onReset)}
            >
              <Wrench className="mr-1.5 h-3.5 w-3.5" /> Fix
            </Button>
          </div>
          <ul className="mt-2 list-inside list-disc pl-6 text-xs text-destructive/80">
            {breakingReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <p className="mt-2 pl-6 text-[11px] text-destructive/70">
            "Fix" snaps the tuned levers back to the computed values that made this strategy
            feasible.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {s.numbers.map((n, i) => (
          <TunableNumberCell
            key={i}
            n={n}
            onTune={onTune}
            onReset={onReset}
            highlight={s.conversionOptions?.recommendedRating}
          />
        ))}
      </div>
    </div>
  );
}

function TunableNumberCell({
  n,
  onTune,
  onReset,
  highlight,
}: {
  n: StrategyNumber;
  onTune: (key: OverrideKey, v: number) => void;
  onReset: (key: OverrideKey) => void;
  highlight?: "L" | "M" | "H";
}) {
  const isPct = n.format === "pct";
  const scale = isPct ? 100 : 1;

  return (
    <div
      className={cn("rounded-md border p-3", n.overridden && "border-primary/40 bg-primary/[0.04]")}
    >
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
      {n.specOptions && n.specOptions.length > 0 && (
        <div className="mt-2">
          <SpecOptionsRow options={n.specOptions} highlight={highlight} />
        </div>
      )}
      {(n.label === "Mortgage rate" || n.label.startsWith("ICR @")) && (
        <Link to="/persona" className="mt-1 inline-block text-[10px] text-primary hover:underline">
          From investor profile →
        </Link>
      )}
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
            title={
              n.overridden
                ? `Reset to computed value (${n.baseline != null ? fmtNumber({ ...n, value: n.baseline }) : "default"})`
                : "Already at the computed value"
            }
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
