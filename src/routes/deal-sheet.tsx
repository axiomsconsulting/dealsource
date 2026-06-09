import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicDealSheet } from "@/lib/deal-sheets.functions";
import { fmtGBP, fmtPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { AppFooter } from "@/components/AppFooter";
import { fmtHistoryDate } from "@/lib/analysis/price-history";
import { useState, useMemo } from "react";
import {
  Sparkles, TrendingUp, Wallet, Calculator, Target, History, Images,
  ChevronDown, ChevronUp, X, ArrowRight, Wrench, MapPin, Zap,
  AlertTriangle, BarChart2, Home, FileText, Shield, RotateCcw,
  ExternalLink, PencilLine, Info,
} from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/deal-sheet")({
  validateSearch: z.object({ t: z.string().min(1).catch("") }),
  loaderDeps: ({ search: { t } }) => ({ t }),
  loader: async ({ deps: { t } }) => {
    if (!t) throw notFound();
    const sheet = await getPublicDealSheet({ data: { token: t } });
    if (!sheet) throw notFound();
    return { sheet };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.sheet?.title ?? "Deal Sheet"} — Investment Opportunity` }],
  }),
  component: DealSheetPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-bold">Deal sheet unavailable</h1>
        <p className="mt-2 text-muted-foreground">{(error as any)?.message ?? "An error occurred."}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-bold">Deal sheet not found</h1>
        <p className="mt-2 text-muted-foreground">This link may have expired or been revoked.</p>
      </div>
    </div>
  ),
});

type ModalKey = "photos" | "condition" | "offer" | "epc" | "refurb" | null;

const SURVEY_CATEGORIES = [
  { key: "roof", label: "Roof", max: 25000 },
  { key: "damp", label: "Damp / moisture", max: 15000 },
  { key: "structural", label: "Structural", max: 30000 },
  { key: "electrical", label: "Electrical rewire", max: 12000 },
  { key: "plumbing", label: "Plumbing / boiler", max: 10000 },
  { key: "windows", label: "Windows / doors", max: 12000 },
  { key: "subsidence", label: "Subsidence risk", max: 40000 },
];

function DealSheetPage() {
  const { sheet } = Route.useLoaderData();
  const snap = sheet.snapshot as any;
  const prop = snap?.property ?? {};
  const a = snap?.analysis ?? {};
  const ai = snap?.ai ?? null;
  const allPhotos = (sheet as any).photos ?? [];
  const redact = sheet.redact;
  const visiblePhotos = allPhotos.filter((p: any) => redact ? !p.is_exterior : true);
  const photos = visiblePhotos.filter((p: any) => !p.is_floor_plan);
  const floorPlans = visiblePhotos.filter((p: any) => p.is_floor_plan);
  const strategies: any[] = a.strategies ?? [];
  const best = strategies.find((s: any) => s.key === a.bestStrategy);
  const displayAddress = redact
    ? `${prop.postcode?.split(" ")[0] ?? prop.city ?? "Location"} · ${prop.property_type ?? ""}`
    : (prop.address ?? "Property");

  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [askingInput, setAskingInput] = useState("");
  const [editingAsking, setEditingAsking] = useState(false);
  const [surveyOverrides, setSurveyOverrides] = useState<Record<string, number>>({});
  const [customSurveyItems, setCustomSurveyItems] = useState<{ id: string; label: string; amount: number }[]>([]);
  const [strategyExpanded, setStrategyExpanded] = useState(false);
  const [leverageExpanded, setLeverageExpanded] = useState(false);
  const [surveyExpanded, setSurveyExpanded] = useState(false);
  const [newSurveyLabel, setNewSurveyLabel] = useState("");
  const [newSurveyAmount, setNewSurveyAmount] = useState("");

  const effectiveAsking: number | null = prop.asking_price_gbp ?? (parseFloat(askingInput) || null);

  const surveyTotal = useMemo(() => {
    const a2 = Object.values(surveyOverrides).reduce((s, v) => s + v, 0);
    const b2 = customSurveyItems.reduce((s, it) => s + it.amount, 0);
    return a2 + b2;
  }, [surveyOverrides, customSurveyItems]);

  const priceHistory: any[] = snap?.priceHistory ?? [];
  const signals = prop.signals ?? {};
  const marketData = prop.market_data ?? null;
  const epcData = prop.epc_data ?? null;

  /* price reductions — priceHistory is newest-first */
  const priceReductionCount: number | null = signals.priceReductions != null
    ? Number(signals.priceReductions)
    : priceHistory.length >= 2
    ? priceHistory.filter((_: any, i: number) => i > 0 && priceHistory[i - 1].value < priceHistory[i].value).length
    : null;
  const totalReduction = priceHistory.length >= 2
    ? priceHistory[priceHistory.length - 1].value - priceHistory[0].value
    : null;
  const sellerEquity = signals.lastSold && effectiveAsking
    ? effectiveAsking - Number(signals.lastSold.value)
    : null;

  const leverageImpact = (a.negotiation ?? []).reduce((s: number, n: any) => s + (n.gbp_impact ?? 0), 0);
  const covenantItem = (a.negotiation ?? []).find((n: any) => /covenant/i.test(n.title));

  const close = () => setActiveModal(null);
  const addCustomSurvey = () => {
    const amt = parseFloat(newSurveyAmount);
    if (!newSurveyLabel.trim() || !amt) return;
    setCustomSurveyItems((items) => [...items, { id: String(Date.now()), label: newSurveyLabel.trim(), amount: amt }]);
    setNewSurveyLabel(""); setNewSurveyAmount("");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <img src="/omnispace-logo.png" alt="Deal Negotiator — Omnispace Estates" className="h-8 w-auto" />
          <Badge variant="outline">Confidential</Badge>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl flex-1 px-4 py-8 md:px-6">

        {/* ── TOP: 2-column grid ── */}
        <div className="grid gap-6 md:grid-cols-2">

          {/* LEFT — identity, score, price, market comps */}
          <div className="flex flex-col gap-4">
            {/* Address + tags */}
            <div>
              <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">{displayAddress}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {prop.beds && <Badge variant="outline">{prop.beds} bed</Badge>}
                {prop.baths && <Badge variant="outline">{prop.baths} bath</Badge>}
                {prop.property_type && <Badge variant="outline">{prop.property_type}</Badge>}
                {prop.epc_rate && <Badge variant="outline">EPC {prop.epc_rate}</Badge>}
                {prop.tenure && <Badge variant="outline">{prop.tenure}</Badge>}
                {prop.area_sqm && <Badge variant="outline">{Math.round(prop.area_sqm)} m²</Badge>}
                {prop.article4_status === "inside" && (
                  <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">Article 4</Badge>
                )}
              </div>
            </div>

            {/* Deal score + indicators */}
            {a.overallScore != null && (
              <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
                <div>
                  <div className="text-4xl font-bold text-primary">{a.overallScore}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Deal score / 100</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(a.dealIndicators ?? []).map((ind: any) => (
                    <Badge key={ind.key} variant="outline" className="text-xs">{ind.value}</Badge>
                  ))}
                  {best && (
                    <Badge variant="outline" className="text-xs">
                      <Calculator className="mr-1 h-3 w-3" />{best.name}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Asking price + market comps */}
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Asking price</p>
                <button
                  onClick={() => setEditingAsking((e) => !e)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <PencilLine className="h-3 w-3" />
                  {prop.asking_price_gbp ? "Override" : "Enter price"}
                </button>
              </div>
              {editingAsking ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg text-muted-foreground">£</span>
                  <Input autoFocus type="number" placeholder="e.g. 185000"
                    value={askingInput} onChange={(e) => setAskingInput(e.target.value)}
                    className="h-8 w-36 text-base" />
                  <Button size="sm" variant="outline" onClick={() => setEditingAsking(false)}>Done</Button>
                </div>
              ) : (
                <p className="text-2xl font-bold">
                  {effectiveAsking
                    ? fmtGBP(effectiveAsking)
                    : <span className="italic text-muted-foreground">Not set — click to enter</span>}
                </p>
              )}

              {/* Inline market comparables */}
              {(marketData || signals.lastSold || best?.monthlyCashflow != null) && (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm">
                  {(() => {
                    const prices = (marketData?.soldComparables ?? []).map((c: any) => c.price).filter(Boolean);
                    const medComp = prices.length
                      ? prices.slice().sort((x: number, y: number) => x - y)[Math.floor(prices.length / 2)]
                      : null;
                    const areaMedian = marketData?.areaStats?.medianSoldPrice ?? marketData?.areaStats?.averageSoldPrice;
                    return (
                      <>
                        {areaMedian && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Area median sold</p>
                            <p className="font-semibold">{fmtGBP(areaMedian)}</p>
                            {effectiveAsking && (
                              <p className={`text-[10px] ${areaMedian < effectiveAsking ? "text-amber-700" : "text-emerald-700"}`}>
                                {fmtPct(Math.abs(areaMedian - effectiveAsking) / effectiveAsking)}{" "}
                                {areaMedian < effectiveAsking ? "below asking" : "above asking"}
                              </p>
                            )}
                          </div>
                        )}
                        {medComp && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Median of {prices.length} comps</p>
                            <p className="font-semibold">{fmtGBP(medComp)}</p>
                            {effectiveAsking && (
                              <p className={`text-[10px] ${medComp < effectiveAsking ? "text-amber-700" : "text-emerald-700"}`}>
                                {fmtPct(Math.abs(medComp - effectiveAsking) / effectiveAsking)}{" "}
                                {medComp < effectiveAsking ? "below asking" : "above asking"}
                              </p>
                            )}
                          </div>
                        )}
                        {signals.lastSold && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Last sold</p>
                            <p className="font-semibold">{fmtGBP(Number(signals.lastSold.value))}</p>
                            <p className="text-[10px] text-muted-foreground">{signals.lastSold.date}</p>
                          </div>
                        )}
                        {best?.monthlyCashflow != null && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">Projected cashflow</p>
                            <p className="font-semibold">{fmtGBP(Math.round(best.monthlyCashflow))}/mo</p>
                            <p className="text-[10px] text-muted-foreground">on {best.name}</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — images */}
          <div className="flex flex-col gap-2">
            {photos.length > 0 ? (
              <>
                <div className="relative overflow-hidden rounded-xl border bg-muted">
                  <img src={photos[photoIndex]?.url} alt={displayAddress}
                    className="h-64 w-full object-cover md:h-[280px]" />
                  {photos.length > 1 && (
                    <div className="absolute bottom-2 right-2 flex gap-1">
                      <button onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                        disabled={photoIndex === 0}
                        className="rounded bg-black/50 p-1.5 text-white disabled:opacity-30 hover:bg-black/70">
                        <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                      </button>
                      <button onClick={() => setPhotoIndex((i) => Math.min(photos.length - 1, i + 1))}
                        disabled={photoIndex === photos.length - 1}
                        className="rounded bg-black/50 p-1.5 text-white disabled:opacity-30 hover:bg-black/70">
                        <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                      </button>
                    </div>
                  )}
                </div>
                {photos.length > 1 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {photos.slice(0, 4).map((p: any, i: number) => (
                      <button key={p.id ?? i} onClick={() => setPhotoIndex(i)}
                        className={`overflow-hidden rounded-md border transition ${photoIndex === i ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100"}`}>
                        <img src={p.url} alt="" className="h-14 w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <button onClick={() => setActiveModal("photos")}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                    <Images className="h-3.5 w-3.5" />
                    View all {photos.length} photo{photos.length !== 1 ? "s" : ""}
                    {floorPlans.length > 0 && ` + ${floorPlans.length} floor plan${floorPlans.length !== 1 ? "s" : ""}`}
                  </button>
                  {ai && (
                    <button onClick={() => setActiveModal("condition")}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                      <Sparkles className="h-3.5 w-3.5 text-accent" /> AI condition report
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
                <div className="text-center">
                  <Home className="mx-auto h-10 w-10 opacity-30" />
                  <p className="mt-2 text-sm">No photos available</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── NEGOTIATION PLAYBOOK ── */}
        <section className="mt-10">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold tracking-tight">
            <Target className="h-5 w-5 text-primary" /> Negotiation Playbook
          </h2>

          {/* 1 — Offer plan */}
          {a.negotiationGuidance && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Offer plan</p>
                <div className="flex flex-wrap items-baseline gap-2 md:gap-4">
                  <Offer3 label="Open" value={fmtGBP(a.negotiationGuidance.openingOffer)} />
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Offer3 label="Target" value={fmtGBP(a.negotiationGuidance.targetOffer)} accent />
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Offer3 label="Walk-away" value={fmtGBP(a.negotiationGuidance.walkAwayOffer)} />
                  {surveyTotal > 0 && (
                    <>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Offer3 label="Survey-adjusted"
                        value={fmtGBP(Math.max(0, a.negotiationGuidance.targetOffer - surveyTotal))} warn />
                    </>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveModal("offer")}>
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Full breakdown
              </Button>
            </div>
          )}

          {/* 2 — 6 signal cards */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <SignalCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Price reductions"
              value={priceReductionCount != null
                ? `${priceReductionCount} reduction${priceReductionCount !== 1 ? "s" : ""}`
                : "No data"}
              sub={totalReduction != null && totalReduction < 0
                ? `−${fmtGBP(Math.abs(totalReduction))} from first listed`
                : undefined}
              tone={priceReductionCount ? "positive" : "neutral"}
            >
              {priceHistory.length >= 2 ? (
                <ul className="space-y-1">
                  {priceHistory.map((h: any, i: number) => (
                    <li key={i} className="flex justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{fmtHistoryDate(h.date)}</span>
                      <span className="font-medium">{fmtGBP(h.value)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">No tracked history available.</p>}
            </SignalCard>

            <SignalCard
              icon={<RotateCcw className="h-4 w-4" />}
              label="Back on market"
              value={signals.backOnMarket != null
                ? (Number(signals.backOnMarket) > 0 ? `${signals.backOnMarket}× relisted` : "Not relisted")
                : "No data"}
              sub={signals.daysOnMarket != null ? `${signals.daysOnMarket} days on market` : undefined}
              tone={Number(signals.backOnMarket) > 0 ? "positive" : "neutral"}
            >
              <p className="text-xs text-muted-foreground">
                A property relisted after withdrawal often signals a failed sale — a motivated seller or overpriced listing.
              </p>
              {signals.daysOnMarket != null && (
                <p className="mt-1 text-xs text-muted-foreground">{signals.daysOnMarket}+ days on market increases leverage.</p>
              )}
            </SignalCard>

            <SignalCard
              icon={<Wallet className="h-4 w-4" />}
              label="Seller equity"
              value={sellerEquity != null
                ? (sellerEquity > 0 ? `~${fmtGBP(sellerEquity)} equity` : "Low / negative equity")
                : "No last-sold data"}
              sub={signals.lastSold
                ? `Bought for ${fmtGBP(Number(signals.lastSold.value))} · ${signals.lastSold.date}`
                : undefined}
              tone={sellerEquity != null && sellerEquity > 50000 ? "positive" : "neutral"}
            >
              <p className="text-xs text-muted-foreground">
                High equity sellers have room to negotiate; those with low equity may be motivated but limited in flexibility.
              </p>
            </SignalCard>

            <SignalCard
              icon={<Shield className="h-4 w-4" />}
              label="Covenant restrictions"
              value={covenantItem ? "Flagged — verify with solicitor" : "None flagged"}
              sub={covenantItem ? `−${fmtGBP(covenantItem.gbp_impact)} estimated impact` : undefined}
              tone={covenantItem ? "warn" : "neutral"}
            >
              <p className="text-xs text-muted-foreground">
                Covenants restricting use, alteration or occupancy can significantly limit strategy and resale value.
                Always request the title register.
              </p>
              {covenantItem && <p className="mt-1 text-xs font-medium text-amber-800">{covenantItem.description}</p>}
            </SignalCard>

            <SignalCard
              icon={<MapPin className="h-4 w-4" />}
              label="Article 4 direction"
              value={prop.article4_status === "inside"
                ? "Inside Article 4 area"
                : prop.article4_status === "partial"
                ? "Partial coverage"
                : "Not in Article 4 area"}
              sub={prop.article4_status === "inside" ? "HMO conversion restricted" : undefined}
              tone={prop.article4_status === "inside" ? "warn" : "neutral"}
            >
              <p className="text-xs text-muted-foreground">
                Article 4 removes the permitted development right to convert a C3 dwelling to a small HMO (C4).
                Planning applications are routinely refused in these areas.
              </p>
              {prop.article4_status === "inside" && (
                <p className="mt-1 text-xs font-medium text-amber-800">HMO strategy not recommended here.</p>
              )}
            </SignalCard>

            <SignalCard
              icon={<Zap className="h-4 w-4" />}
              label="EPC / energy"
              value={(epcData?.currentRating ?? prop.epc_rate)
                ? `Band ${epcData?.currentRating ?? prop.epc_rate}${epcData?.currentScore ? ` (${epcData.currentScore} SAP)` : ""}`
                : "Not available"}
              sub={epcData?.potentialRating ? `Potential: Band ${epcData.potentialRating}` : undefined}
              tone={(epcData?.currentRating ?? prop.epc_rate ?? "D") <= "C" ? "neutral" : "warn"}
              actionLabel="Details"
              onAction={() => setActiveModal("epc")}
            >
              <p className="text-xs text-muted-foreground">
                Properties below Band C face mandatory upgrade costs before letting under forthcoming minimum EPC rules.
              </p>
            </SignalCard>
          </div>

          {/* 3 — Refurb capex */}
          {(a.effectiveInputs?.refurb_cost > 0 || prop.refurb_estimate) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Refurb capex offset</p>
                <p className="text-lg font-bold">−{fmtGBP(a.effectiveInputs?.refurb_cost ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Estimated works — direct negotiating leverage on asking price</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveModal("refurb")}>
                <Wrench className="mr-1.5 h-3.5 w-3.5" /> View breakdown
              </Button>
            </div>
          )}

          {/* 4 — Post-survey negotiation */}
          <div className="mb-4 overflow-hidden rounded-xl border">
            <button
              className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30"
              onClick={() => setSurveyExpanded((e) => !e)}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium">Post-survey negotiation</span>
                {surveyTotal > 0 && (
                  <Badge variant="secondary" className="text-xs">−{fmtGBP(surveyTotal)} deduction</Badge>
                )}
              </div>
              {surveyExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {surveyExpanded && (
              <div className="border-t p-4">
                <p className="mb-4 text-sm text-muted-foreground">
                  Adjust sliders to quantify survey findings. The deduction updates your offer plan automatically.
                </p>
                {ai?.items?.length > 0 && (
                  <div className="mb-5">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      From AI condition report
                    </p>
                    <div className="space-y-3">
                      {ai.items.map((it: any) => {
                        const key = `ai_${it.area}_${it.issue}`;
                        const cur = surveyOverrides[key] ?? (it.estimateGbp ?? 0);
                        const max = Math.max((it.estimateGbp ?? 5000) * 3, 10000);
                        return (
                          <div key={key} className="rounded-lg border p-3">
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-sm font-medium capitalize">{it.area}: {it.issue}</p>
                              <span className="text-sm font-bold text-primary">−{fmtGBP(cur)}</span>
                            </div>
                            <p className="mb-2 text-xs capitalize text-muted-foreground">
                              {it.severity} · AI estimate: {fmtGBP(it.estimateGbp)}
                            </p>
                            <Slider min={0} max={max} step={250} value={[cur]}
                              onValueChange={([v]) => setSurveyOverrides((o) => ({ ...o, [key]: v }))} />
                            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                              <span>None</span><span>{fmtGBP(max)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="mb-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Additional findings
                  </p>
                  <div className="space-y-3">
                    {SURVEY_CATEGORIES.map((cat) => {
                      const cur = surveyOverrides[cat.key] ?? 0;
                      return (
                        <div key={cat.key}
                          className={`rounded-lg border p-3 transition-colors ${cur > 0 ? "border-amber-200 bg-amber-50/40" : ""}`}>
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-sm font-medium">{cat.label}</p>
                            <span className={`text-sm font-bold ${cur > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                              {cur > 0 ? `−${fmtGBP(cur)}` : "None"}
                            </span>
                          </div>
                          <Slider min={0} max={cat.max} step={500} value={[cur]}
                            onValueChange={([v]) => setSurveyOverrides((o) => ({ ...o, [cat.key]: v }))} />
                          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                            <span>None</span><span>{fmtGBP(cat.max / 2)}</span><span>{fmtGBP(cat.max)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {customSurveyItems.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {customSurveyItems.map((it) => (
                      <div key={it.id}
                        className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2">
                        <span className="text-sm font-medium">{it.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-amber-700">−{fmtGBP(it.amount)}</span>
                          <button onClick={() => setCustomSurveyItems((items) => items.filter((i) => i.id !== it.id))}
                            className="rounded-full p-0.5 hover:bg-muted">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mb-4 flex items-center gap-2">
                  <Input placeholder="Custom issue" value={newSurveyLabel}
                    onChange={(e) => setNewSurveyLabel(e.target.value)} className="h-8 flex-1 text-sm" />
                  <Input placeholder="£ cost" type="number" value={newSurveyAmount}
                    onChange={(e) => setNewSurveyAmount(e.target.value)} className="h-8 w-24 text-sm" />
                  <Button size="sm" variant="outline" onClick={addCustomSurvey}>Add</Button>
                </div>
                {surveyTotal > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
                    <span className="font-medium">Total survey deduction</span>
                    <span className="text-lg font-bold text-primary">−{fmtGBP(surveyTotal)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5 — Leverage summary */}
          {(a.negotiation ?? []).length > 0 && (
            <div className="mb-4 overflow-hidden rounded-xl border">
              <button
                className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30"
                onClick={() => setLeverageExpanded((e) => !e)}
              >
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-primary" />
                  <span className="font-medium">Negotiation leverage points</span>
                  <Badge variant="secondary" className="text-xs">{a.negotiation.length} points</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  −{fmtGBP(leverageImpact)}
                  {leverageExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {leverageExpanded && (
                <div className="space-y-2 border-t px-4 pb-4 pt-3">
                  {a.negotiation.map((n: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="font-medium">{n.title}</p>
                        <p className="text-sm text-muted-foreground">{n.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-bold text-primary">−{fmtGBP(n.gbp_impact)}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">{n.confidence}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── STRATEGY ROW ── */}
        {strategies.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-xl border">
            <button
              className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30"
              onClick={() => setStrategyExpanded((e) => !e)}
            >
              <div className="flex items-center gap-3">
                <Calculator className="h-5 w-5 text-primary" />
                <div>
                  <span className="font-semibold">{best?.name ?? "Recommended strategy"}</span>
                  {best?.summary && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      — {best.summary.slice(0, 80)}{best.summary.length > 80 ? "…" : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="text-sm">{best?.dealScore}/100</Badge>
                {strategyExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>
            {strategyExpanded && (
              <div className="border-t p-4">
                {best?.numbers?.length > 0 && (
                  <div className="mb-6">
                    <p className="mb-3 text-sm text-muted-foreground">{best.summary}</p>
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                      {best.numbers.map((n: any, i: number) => (
                        <div key={i} className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{n.label}</p>
                          <p className="text-lg font-semibold">
                            {n.format === "gbp" ? fmtGBP(n.value)
                              : n.format === "pct" ? fmtPct(n.value)
                              : Math.round(n.value * 100) / 100}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  All strategy comparison
                </p>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {strategies.map((s: any) => (
                    <div key={s.key}
                      className={`rounded-lg border p-3 ${s.key === a.bestStrategy ? "border-primary/40 bg-primary/[0.03]" : ""}`}>
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{s.name}</p>
                        <Badge variant={s.dealScore >= 60 ? "default" : "outline"} className="text-xs">
                          {s.dealScore}/100
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>
                      {!s.feasible && (
                        <Badge variant="outline" className="mt-2 text-[10px] text-muted-foreground">Not feasible</Badge>
                      )}
                    </div>
                  ))}
                </div>
                {priceHistory.length >= 2 && (
                  <div className="mt-6">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <History className="mb-0.5 mr-1 inline h-3.5 w-3.5" />Price history
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {priceHistory.map((h: any, i: number) => (
                        <li key={i}
                          className="flex items-center justify-between gap-3 border-b border-dashed pb-1.5 last:border-0">
                          <span className="text-muted-foreground">
                            {fmtHistoryDate(h.date)}
                            {i === 0 && <Badge variant="outline" className="ml-2 h-5 text-[10px]">latest</Badge>}
                          </span>
                          <span className="flex items-center gap-2 font-medium">
                            {fmtGBP(h.value)}
                            {h.changeFromPrevious != null && h.changeFromPrevious !== 0 && (
                              <span className={h.changeFromPrevious < 0 ? "text-xs text-emerald-700" : "text-xs text-amber-700"}>
                                ({h.changeFromPrevious < 0 ? "−" : "+"}{fmtGBP(Math.abs(h.changeFromPrevious))})
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Generated by Deal Negotiator · {snap?.generatedAt ? new Date(snap.generatedAt).toLocaleDateString("en-GB") : ""}
          {" "}· Figures are estimates and not investment advice.
          {prop.source_link && (
            <> · <a href={prop.source_link} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline">
              Listing <ExternalLink className="h-3 w-3" /></a></>
          )}
        </p>
      </main>
      <AppFooter />

      {/* ── MODALS ── */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8 backdrop-blur-sm"
          onClick={close}>
          <div className="relative my-4 w-full max-w-2xl rounded-xl border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <button onClick={close} className="absolute right-4 top-4 rounded-full p-1.5 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>

            {/* Photos modal */}
            {activeModal === "photos" && (
              <div className="p-6">
                <h3 className="mb-4 font-semibold">Photos{floorPlans.length > 0 ? " & floor plans" : ""}</h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {photos.map((p: any, i: number) => (
                    <a key={p.id ?? i} href={p.url} target="_blank" rel="noreferrer">
                      <img src={p.url} alt="" className="h-40 w-full rounded-md object-cover transition hover:opacity-90" />
                    </a>
                  ))}
                </div>
                {floorPlans.length > 0 && (
                  <>
                    <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Floor plans</p>
                    <div className={`grid gap-3 ${floorPlans.length > 1 ? "sm:grid-cols-2" : ""}`}>
                      {floorPlans.map((p: any, i: number) => (
                        <a key={p.id ?? i} href={p.url} target="_blank" rel="noreferrer"
                          className="block overflow-hidden rounded-md border bg-muted/30">
                          <img src={p.url} alt="Floor plan" className="max-h-[300px] w-full object-contain p-2" />
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* AI condition modal */}
            {activeModal === "condition" && ai && (
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <h3 className="font-semibold">AI condition report</h3>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">{ai.summary}</p>
                {ai.items?.length > 0 && (
                  <div className="space-y-2">
                    {ai.items.map((it: any, i: number) => (
                      <div key={i} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                        <div>
                          <p className="font-medium capitalize">{it.area}: {it.issue}</p>
                          <Badge variant="outline" className="mt-1 capitalize text-[10px]">{it.severity}</Badge>
                        </div>
                        <div className="shrink-0 font-semibold">{fmtGBP(it.estimateGbp)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Offer modal */}
            {activeModal === "offer" && a.negotiationGuidance && (
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Offer plan — full breakdown</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniStat label="Opening bid" value={fmtGBP(a.negotiationGuidance.openingOffer)} />
                  <MiniStat label="Target deal price" value={fmtGBP(a.negotiationGuidance.targetOffer)} accent />
                  <MiniStat label="Walk-away ceiling" value={fmtGBP(a.negotiationGuidance.walkAwayOffer)} />
                  <MiniStat label="Max opening discount"
                    value={`${(a.negotiationGuidance.maxOpeningDiscountPct * 100).toFixed(1)}%`} />
                  {surveyTotal > 0 && (
                    <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-medium text-amber-800">Survey-adjusted target</p>
                      <p className="text-lg font-bold text-amber-900">
                        {fmtGBP(Math.max(0, a.negotiationGuidance.targetOffer - surveyTotal))}
                      </p>
                      <p className="text-xs text-amber-700">−{fmtGBP(surveyTotal)} survey deduction applied</p>
                    </div>
                  )}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Numbers are underwritten at the target price — even if the agent holds you there, the returns still hold.
                </p>
              </div>
            )}

            {/* EPC modal */}
            {activeModal === "epc" && (
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">EPC / energy performance</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniStat label="Current band" value={(epcData?.currentRating ?? prop.epc_rate) || "Unknown"} />
                  {epcData?.currentScore && <MiniStat label="SAP score" value={String(epcData.currentScore)} />}
                  {epcData?.potentialRating && <MiniStat label="Potential band" value={epcData.potentialRating} />}
                  {epcData?.potentialScore && <MiniStat label="Potential SAP" value={String(epcData.potentialScore)} />}
                </div>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <p>From 2025, landlords must achieve EPC Band C or above for new tenancies.</p>
                  {(epcData?.currentRating ?? prop.epc_rate ?? "D") > "C" && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                      Below Band C — factor EPC improvement costs into your budget.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Refurb modal */}
            {activeModal === "refurb" && (
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Refurb capex estimate</h3>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">
                  Total: <strong>{fmtGBP(a.effectiveInputs?.refurb_cost ?? 0)}</strong> — deducted from asking price as leverage.
                </p>
                {prop.refurb_estimate?.lines?.length > 0 ? (
                  <div className="space-y-1.5">
                    {prop.refurb_estimate.lines.map((line: any, i: number) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                        <span>{line.label}</span>
                        <span className="font-medium">{fmtGBP(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No itemised breakdown — algorithmic estimate based on type, size and condition.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */
function SignalCard({ icon, label, value, sub, tone, children, actionLabel, onAction }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  tone: "positive" | "warn" | "neutral"; children?: React.ReactNode;
  actionLabel?: string; onAction?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toneClass = tone === "positive"
    ? "border-emerald-200 bg-emerald-50/60"
    : tone === "warn" ? "border-amber-200 bg-amber-50/60" : "border-border bg-card";
  const iconClass = tone === "positive"
    ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-muted-foreground";
  return (
    <div className={`rounded-xl border p-3.5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`mt-0.5 shrink-0 ${iconClass}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold leading-snug">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {onAction ? (
          <button onClick={onAction}
            className="ml-1 shrink-0 rounded-md border px-2 py-0.5 text-[10px] hover:bg-muted">
            {actionLabel}
          </button>
        ) : (
          <button onClick={() => setOpen((o) => !o)}
            className="ml-1 shrink-0 rounded-full p-1 hover:bg-muted/60">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      {open && !onAction && children && <div className="mt-3 border-t pt-3">{children}</div>}
    </div>
  );
}

function Offer3({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-base font-bold md:text-lg ${accent ? "text-primary" : warn ? "text-amber-700" : ""}`}>
        {value}
      </span>
    </span>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-primary/30 bg-primary/[0.03]" : "bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
