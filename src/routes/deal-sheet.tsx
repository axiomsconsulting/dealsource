import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicDealSheet } from "@/lib/deal-sheets.functions";
import { fmtGBP, fmtPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { AppFooter } from "@/components/AppFooter";
import { fmtHistoryDate } from "@/lib/analysis/price-history";
import {
  Sparkles,
  TrendingUp,
  Calculator,
  Target,
  History,
  Images,
  ArrowRight,
  Wrench,
  MapPin,
  AlertTriangle,
  BarChart2,
  Home,
  Shield,
  ExternalLink,
  ShieldAlert,
  FileDown,
  User,
} from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/deal-sheet")({
  validateSearch: z.object({ t: z.string().min(1).catch("") }),
  loaderDeps: ({ search: { t } }) => ({ t }),
  loader: async ({ deps: { t } }) => {
    if (!t) throw notFound();
    const sheet = await getPublicDealSheet({ data: { token: t } });
    if (!sheet) throw notFound();
    return { sheet, token: t };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.sheet?.title ?? "Deal Sheet"} — Investment Opportunity` }],
  }),
  component: DealSheetPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-bold">Deal sheet unavailable</h1>
        <p className="mt-2 text-muted-foreground">
          {(error as any)?.message ?? "An error occurred."}
        </p>
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

function DealSheetPage() {
  const { sheet, token } = Route.useLoaderData();
  const snap = sheet.snapshot as any;
  const prop = snap?.property ?? {};
  const a = snap?.analysis ?? {};
  const persona = snap?.persona ?? null;
  const ai = snap?.ai ?? null;
  const priceHistory: any[] = snap?.priceHistory ?? [];
  const allPhotos = (sheet as any).photos ?? [];
  const redactExterior = sheet.redact;
  const hideAddress = sheet.hide_address;
  const hidePhotos = sheet.hide_photos;
  const visiblePhotos = allPhotos.filter((p: any) => (redactExterior ? !p.is_exterior : true));
  const photos = visiblePhotos.filter((p: any) => !p.is_floor_plan);
  const floorPlans = visiblePhotos.filter((p: any) => p.is_floor_plan);

  const strategies: any[] = a.strategies ?? [];
  const best = strategies.find((s: any) => s.key === a.bestStrategy);
  const guidance = a.negotiationGuidance;
  const negotiation: any[] = a.negotiation ?? [];
  const signals = prop.signals ?? {};
  const marketData = prop.market_data ?? null;
  const epcData = prop.epc_data ?? null;
  const riskFlags: any[] = a.riskFlags ?? [];

  const displayAddress = hideAddress
    ? `${prop.postcode?.split(" ")[0] ?? prop.city ?? "Location"} · ${prop.property_type ?? ""}`
    : (prop.address ?? "Property");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 md:px-6">
          <img
            src="/omnispace-logo.png"
            alt="Deal Negotiator — Omnispace Estates"
            className="h-8 w-auto"
          />
          <Badge variant="outline">Confidential — Investment Summary</Badge>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl flex-1 space-y-4 px-4 py-8 md:px-6">
        {/* ── TITLE BLOCK ── */}
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">
            {displayAddress}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {prop.beds != null && <Badge variant="outline">{prop.beds} bed</Badge>}
            {prop.baths != null && <Badge variant="outline">{prop.baths} bath</Badge>}
            {prop.property_type && <Badge variant="outline">{prop.property_type}</Badge>}
            {prop.epc_rate && <Badge variant="outline">EPC {prop.epc_rate}</Badge>}
            {prop.tenure && <Badge variant="outline">{prop.tenure}</Badge>}
            {prop.area_sqm && <Badge variant="outline">{Math.round(prop.area_sqm)} m²</Badge>}
            {prop.article4_status === "inside" && (
              <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">
                Article 4
              </Badge>
            )}
          </div>
        </div>

        {/* ── HEADLINE ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
            {a.overallScore != null && (
              <div className="shrink-0">
                <div className="text-4xl font-bold text-primary">{a.overallScore}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Deal score / 100
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(a.dealIndicators ?? []).map((ind: any) => (
                <Badge key={ind.key} variant="outline" className="text-xs">
                  {ind.value}
                </Badge>
              ))}
              {best && (
                <Badge variant="outline" className="text-xs">
                  <Calculator className="mr-1 h-3 w-3" />
                  {best.name}
                </Badge>
              )}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Asking price
            </p>
            <p className="text-2xl font-bold">
              {prop.asking_price_gbp ? (
                fmtGBP(prop.asking_price_gbp)
              ) : (
                <span className="italic text-muted-foreground">Not listed</span>
              )}
            </p>
            {best?.summary && <p className="mt-1 text-xs text-muted-foreground">{best.summary}</p>}
          </div>
        </div>

        {/* ── INVESTOR CRITERIA ── */}
        {persona && (
          <CollapsibleCard
            id="investor-criteria"
            icon={<User className="h-5 w-5 text-primary" />}
            title="Investor criteria applied"
            summary={`${persona.name ?? "Investor"} · ${a.personaMatch?.pass ? "Fits criteria" : "Partial fit"}`}
          >
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <MiniStat label="Profile" value={persona.name ?? "—"} />
              {persona.investor_type && (
                <MiniStat
                  label="Investor type"
                  value={String(persona.investor_type).replace(/_/g, " ")}
                />
              )}
              {persona.cash_available_gbp != null && (
                <MiniStat label="Cash available" value={fmtGBP(persona.cash_available_gbp)} />
              )}
              {persona.target_rent_gbp != null && (
                <MiniStat label="Target rent" value={`${fmtGBP(persona.target_rent_gbp)}/mo`} />
              )}
              {persona.target_offer_gbp != null && (
                <MiniStat label="Target offer" value={fmtGBP(persona.target_offer_gbp)} />
              )}
              {persona.max_offer_gbp != null && (
                <MiniStat label="Max offer" value={fmtGBP(persona.max_offer_gbp)} />
              )}
              {persona.refurb_buffer_gbp != null && (
                <MiniStat label="Refurb buffer" value={fmtGBP(persona.refurb_buffer_gbp)} />
              )}
              {(persona.min_beds != null || persona.max_beds != null) && (
                <MiniStat
                  label="Bedroom range"
                  value={`${persona.min_beds ?? "–"}–${persona.max_beds ?? "–"}`}
                />
              )}
              {persona.min_epc && <MiniStat label="Min. EPC" value={persona.min_epc} />}
            </div>
            <div className="mt-3 rounded-lg border p-3 text-sm">
              {a.personaMatch?.pass ? (
                <p className="font-medium text-emerald-700">
                  This property fits the investor criteria above.
                </p>
              ) : (
                <>
                  <p className="font-medium text-amber-800">
                    This property does not fully fit the criteria above:
                  </p>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {(a.personaMatch?.reasons ?? []).map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </CollapsibleCard>
        )}

        {/* ── OFFER PLAN ── */}
        {guidance && (
          <CollapsibleCard
            id="offer-plan"
            icon={<Target className="h-5 w-5 text-primary" />}
            title="Offer plan"
            summary={`Open ${fmtGBP(guidance.openingOffer)} → Target ${fmtGBP(guidance.targetOffer)} → Walk-away ${fmtGBP(guidance.walkAwayOffer)}`}
          >
            <div className="flex flex-wrap items-baseline gap-2 md:gap-4">
              <OfferStep label="Asking" value={fmtGBP(guidance.askingPrice)} />
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <OfferStep label="Open" value={fmtGBP(guidance.openingOffer)} />
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <OfferStep label="Target" value={fmtGBP(guidance.targetOffer)} accent />
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <OfferStep label="Walk-away" value={fmtGBP(guidance.walkAwayOffer)} />
              {guidance.equityPlan?.maxOfferForTargetEquity != null && (
                <>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <OfferStep
                    label="Equity-target ceiling"
                    value={fmtGBP(guidance.equityPlan.maxOfferForTargetEquity)}
                    warn
                  />
                </>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <MiniStat label="Price band" value={guidance.priceBand} />
              <MiniStat label="Negotiation stance" value={guidance.stance.replace(/-/g, " ")} />
              <MiniStat
                label="Max opening discount"
                value={fmtPct(guidance.maxOpeningDiscountPct)}
              />
              {guidance.epcToCCost != null && (
                <MiniStat
                  label="EPC-to-C cost (in walk-away)"
                  value={fmtGBP(guidance.epcToCCost)}
                />
              )}
            </div>
            {guidance.warnings?.length > 0 && (
              <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-amber-800">
                {guidance.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </CollapsibleCard>
        )}

        {/* ── WHY THIS PRICE: NEGOTIATION LEVERAGE ── */}
        {negotiation.length > 0 && (
          <CollapsibleCard
            id="negotiation-leverage"
            icon={<BarChart2 className="h-5 w-5 text-primary" />}
            title="Why this price — negotiation leverage"
            summary={`${negotiation.length} point${negotiation.length === 1 ? "" : "s"} · −${fmtGBP(a.negotiationTotal ?? 0)} weighted`}
          >
            <div className="space-y-2">
              {negotiation.map((n: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground">{n.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold text-primary">−{fmtGBP(n.gbp_impact)}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      {n.confidence}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
                <span className="font-medium">Total weighted leverage</span>
                <span className="text-lg font-bold text-primary">
                  −{fmtGBP(a.negotiationTotal ?? 0)}
                </span>
              </div>
            </div>
          </CollapsibleCard>
        )}

        {/* ── MARKET SIGNALS ── */}
        <CollapsibleCard
          id="market-signals"
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
          title="Market signals"
          summary="Price history, listing activity, equity & EPC"
        >
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <MiniStat
              label="Price reductions"
              value={
                signals.priceReductions != null
                  ? `${signals.priceReductions} reduction${Number(signals.priceReductions) !== 1 ? "s" : ""}`
                  : "No data"
              }
            />
            <MiniStat
              label="Back on market"
              value={
                signals.backOnMarket != null
                  ? Number(signals.backOnMarket) > 0
                    ? `${signals.backOnMarket}× relisted`
                    : "Not relisted"
                  : "No data"
              }
            />
            <MiniStat
              label="Days on market"
              value={signals.daysOnMarket != null ? String(signals.daysOnMarket) : "No data"}
            />
            {signals.lastSold && (
              <MiniStat
                label="Last sold"
                value={`${fmtGBP(Number(signals.lastSold.value))} (${signals.lastSold.date})`}
              />
            )}
            <MiniStat
              label="EPC"
              value={
                (epcData?.currentRating ?? prop.epc_rate)
                  ? `Band ${epcData?.currentRating ?? prop.epc_rate}${epcData?.currentScore ? ` (${epcData.currentScore} SAP)` : ""}`
                  : "Not available"
              }
            />
            <MiniStat
              label="Article 4"
              value={
                prop.article4_status === "inside"
                  ? "Inside area — HMO restricted"
                  : prop.article4_status === "partial"
                    ? "Partial coverage"
                    : "Not in area"
              }
            />
          </div>

          {priceHistory.length >= 2 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <History className="mb-0.5 mr-1 inline h-3.5 w-3.5" />
                Price history
              </p>
              <ul className="space-y-1.5 text-sm">
                {priceHistory.map((h: any, i: number) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 border-b border-dashed pb-1.5 last:border-0"
                  >
                    <span className="text-muted-foreground">
                      {fmtHistoryDate(h.date)}
                      {i === 0 && (
                        <Badge variant="outline" className="ml-2 h-5 text-[10px]">
                          latest
                        </Badge>
                      )}
                    </span>
                    <span className="flex items-center gap-2 font-medium">
                      {fmtGBP(h.value)}
                      {h.changeFromPrevious != null && h.changeFromPrevious !== 0 && (
                        <span
                          className={
                            h.changeFromPrevious < 0
                              ? "text-xs text-emerald-700"
                              : "text-xs text-amber-700"
                          }
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
          )}

          {marketData && (marketData.areaStats || marketData.soldComparables?.length > 0) && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <MapPin className="mb-0.5 mr-1 inline h-3.5 w-3.5" />
                Area comparables
              </p>
              {marketData.areaStats && (
                <div className="mb-2 grid gap-3 sm:grid-cols-2">
                  {(marketData.areaStats.medianSoldPrice ??
                    marketData.areaStats.averageSoldPrice) != null && (
                    <MiniStat
                      label={marketData.areaStats.periodLabel ?? "Area sold price"}
                      value={fmtGBP(
                        marketData.areaStats.medianSoldPrice ??
                          marketData.areaStats.averageSoldPrice,
                      )}
                    />
                  )}
                  {marketData.areaStats.sampleSize != null && (
                    <MiniStat
                      label="Sample size"
                      value={`${marketData.areaStats.sampleSize} sales`}
                    />
                  )}
                </div>
              )}
              {marketData.soldComparables?.length > 0 && (
                <ul className="space-y-1.5 text-sm">
                  {marketData.soldComparables.slice(0, 6).map((c: any, i: number) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 border-b border-dashed pb-1.5 last:border-0"
                    >
                      <span className="min-w-0 truncate text-muted-foreground">
                        {c.address ?? "Comparable"}
                        {c.date ? ` · ${c.date}` : ""}
                      </span>
                      <span className="shrink-0 font-medium">
                        {c.price != null ? fmtGBP(c.price) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CollapsibleCard>

        {/* ── STRATEGY COMPARISON ── */}
        {strategies.length > 0 && (
          <CollapsibleCard
            id="strategy-comparison"
            icon={<Calculator className="h-5 w-5 text-primary" />}
            title="Strategy comparison"
            summary={`Best: ${best?.name ?? "—"} · ${best?.dealScore ?? "—"}/100`}
          >
            {best?.numbers?.length > 0 && (
              <div className="mb-5">
                <p className="mb-1 font-medium">{best.name} — recommended</p>
                <p className="mb-3 text-sm text-muted-foreground">{best.summary}</p>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {best.numbers.map((n: any, i: number) => (
                    <div key={i} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{n.label}</p>
                      <p className="text-lg font-semibold">
                        {n.format === "gbp"
                          ? fmtGBP(n.value)
                          : n.format === "pct"
                            ? fmtPct(n.value)
                            : Math.round(n.value * 100) / 100}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              All strategies considered
            </p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {strategies.map((s: any) => (
                <div
                  key={s.key}
                  className={`rounded-lg border p-3 ${s.key === a.bestStrategy ? "border-primary/40 bg-primary/[0.03]" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{s.name}</p>
                    <Badge variant={s.dealScore >= 60 ? "default" : "outline"} className="text-xs">
                      {s.dealScore}/100
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>
                  {!s.feasible && (
                    <Badge variant="outline" className="mt-2 text-[10px] text-muted-foreground">
                      Not feasible
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleCard>
        )}

        {/* ── CONDITION & REFURB ── */}
        {(ai || prop.refurb_estimate || a.effectiveInputs?.refurb_cost > 0) && (
          <CollapsibleCard
            id="condition-refurb"
            icon={<Wrench className="h-5 w-5 text-primary" />}
            title="Condition & refurbishment"
            summary={
              a.effectiveInputs?.refurb_cost > 0
                ? `Estimated refurb: ${fmtGBP(a.effectiveInputs.refurb_cost)}`
                : "AI condition notes"
            }
          >
            {ai?.summary && (
              <div className="mb-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-accent" /> AI condition report
                </p>
                <p className="text-sm text-muted-foreground">{ai.summary}</p>
                {ai.items?.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {ai.items.map((it: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-start justify-between gap-3 rounded-lg border p-2.5 text-sm"
                      >
                        <div>
                          <p className="font-medium capitalize">
                            {it.area}: {it.issue}
                          </p>
                          <Badge variant="outline" className="mt-1 capitalize text-[10px]">
                            {it.severity}
                          </Badge>
                        </div>
                        <div className="shrink-0 font-semibold">{fmtGBP(it.estimateGbp)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {a.effectiveInputs?.refurb_cost > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Refurb capex
                </p>
                <p className="mb-2 text-lg font-bold">{fmtGBP(a.effectiveInputs.refurb_cost)}</p>
                {prop.refurb_estimate?.lines?.length > 0 ? (
                  <div className="space-y-1.5">
                    {prop.refurb_estimate.lines.map((line: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border p-2.5 text-sm"
                      >
                        <span>{line.label}</span>
                        <span className="font-medium">{fmtGBP(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Algorithmic estimate based on property type, size and condition.
                  </p>
                )}
              </div>
            )}
          </CollapsibleCard>
        )}

        {/* ── RISK FLAGS ── */}
        {riskFlags.length > 0 && (
          <CollapsibleCard
            id="risk-flags"
            icon={<Shield className="h-5 w-5 text-primary" />}
            title="Risk flags"
            summary={`${riskFlags.length} flagged`}
          >
            <div className="space-y-2">
              {riskFlags.map((f: any, i: number) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${f.severity === "red" ? "border-destructive/40 bg-destructive/5" : "border-amber-200 bg-amber-50/60"}`}
                >
                  {f.severity === "red" ? (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  )}
                  <div>
                    <p className="font-medium">{f.label}</p>
                    <p className="text-muted-foreground">{f.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        )}

        {/* ── PHOTOS ── */}
        {!hidePhotos && (photos.length > 0 || floorPlans.length > 0) && (
          <CollapsibleCard
            id="photos"
            icon={<Images className="h-5 w-5 text-primary" />}
            title="Photos"
            summary={`${photos.length} photo${photos.length === 1 ? "" : "s"}${floorPlans.length > 0 ? ` + ${floorPlans.length} floor plan${floorPlans.length === 1 ? "" : "s"}` : ""}`}
          >
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {photos.map((p: any, i: number) => (
                  <a key={p.id ?? i} href={p.url} target="_blank" rel="noreferrer">
                    <img
                      src={p.url}
                      alt=""
                      className="h-40 w-full rounded-md object-cover transition hover:opacity-90"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
                <div className="text-center">
                  <Home className="mx-auto h-8 w-8 opacity-30" />
                  <p className="mt-2 text-sm">No photos available</p>
                </div>
              </div>
            )}
            {floorPlans.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Floor plans
                </p>
                <div className={`grid gap-3 ${floorPlans.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {floorPlans.map((p: any, i: number) => (
                    <a
                      key={p.id ?? i}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border bg-muted/30"
                    >
                      <img
                        src={p.url}
                        alt="Floor plan"
                        className="max-h-[300px] w-full object-contain p-2"
                      />
                    </a>
                  ))}
                </div>
              </>
            )}
          </CollapsibleCard>
        )}

        {/* ── FOOTER ── */}
        <div className="space-y-3 pt-2 text-center">
          <a href={`/api/deal-pdf/${token}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <FileDown className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </a>
          <p className="text-xs text-muted-foreground">
            Generated by Deal Negotiator ·{" "}
            {snap?.generatedAt ? new Date(snap.generatedAt).toLocaleDateString("en-GB") : ""} ·
            Figures are estimates and not investment advice.
            {!hideAddress && prop.source_link && (
              <>
                {" "}
                ·{" "}
                <a
                  href={prop.source_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  Listing <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}

/* ── Sub-components ── */
function OfferStep({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className={`text-base font-bold md:text-lg ${accent ? "text-primary" : warn ? "text-amber-700" : ""}`}
      >
        {value}
      </span>
    </span>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${accent ? "border-primary/30 bg-primary/[0.03]" : "bg-card"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
