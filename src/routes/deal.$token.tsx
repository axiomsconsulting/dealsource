import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicDealSheet } from "@/lib/deal-sheets.functions";
import { fmtGBP, fmtPct } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, Wallet, Calculator, Target, History } from "lucide-react";
import { fmtHistoryDate } from "@/lib/analysis/price-history";
import { AppFooter } from "@/components/AppFooter";

export const Route = createFileRoute("/deal/$token")({
  loader: async ({ params }) => {
    const sheet = await getPublicDealSheet({ data: { token: params.token } });
    if (!sheet) throw notFound();
    return { sheet };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.sheet?.title ?? "Deal Sheet"} — Investment Opportunity` }],
  }),
  component: DealSheetPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div><h1 className="text-2xl font-bold">Deal sheet unavailable</h1><p className="mt-2 text-muted-foreground">{error.message}</p></div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div><h1 className="text-2xl font-bold">Deal sheet not found</h1><p className="mt-2 text-muted-foreground">This link may have expired or been revoked.</p></div>
    </div>
  ),
});

function DealSheetPage() {
  const { sheet } = Route.useLoaderData();
  const snap = sheet.snapshot as any;
  const prop = snap.property;
  const a = snap.analysis;
  const ai = snap.ai;
  const allPhotos = (sheet as any).photos ?? [];
  const redact = sheet.redact;
  const visiblePhotos = allPhotos.filter((p: any) => redact ? !p.is_exterior : true);
  const photos = visiblePhotos.filter((p: any) => !p.is_floor_plan);
  const floorPlans = visiblePhotos.filter((p: any) => p.is_floor_plan);
  const best = a.strategies.find((s: any) => s.key === a.bestStrategy);
  const hero = photos[0];
  const displayAddress = redact
    ? `${prop.postcode?.split(" ")[0] ?? prop.city ?? "Location"} · ${prop.property_type ?? ""}`
    : prop.address;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <img src="/omnispace-logo.png" alt="Deal Negotiator — Omnispace Estates" className="h-8 w-auto" />
          <Badge variant="outline">Confidential</Badge>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl flex-1 px-6 py-10">
        {hero && (
          <div className="mb-8 overflow-hidden rounded-xl border bg-muted">
            <img src={hero.url} alt={displayAddress} className="h-[360px] w-full object-cover" />
          </div>
        )}

        <h1 className="text-3xl font-bold tracking-tight">{displayAddress}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {prop.beds && <Badge variant="outline">{prop.beds} bed</Badge>}
          {prop.baths && <Badge variant="outline">{prop.baths} bath</Badge>}
          {prop.property_type && <Badge variant="outline">{prop.property_type}</Badge>}
          {prop.epc_rate && <Badge variant="outline">EPC {prop.epc_rate}</Badge>}
          {prop.tenure && <Badge variant="outline">{prop.tenure}</Badge>}
          {prop.area_sqm && <Badge variant="outline">{Math.round(prop.area_sqm)} m²</Badge>}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <KPI icon={<Wallet />} label="Asking" value={fmtGBP(prop.asking_price_gbp)} />
          <KPI icon={<TrendingUp />} label="Deal score" value={`${a.overallScore}/100`} accent />
          <KPI icon={<Calculator />} label="Best strategy" value={best?.name ?? "—"} />
          <KPI icon={<Sparkles />} label="Monthly cashflow" value={best?.monthlyCashflow != null ? fmtGBP(Math.round(best.monthlyCashflow)) : "—"} />
        </div>

        {a.negotiationGuidance && (
          <Card className="mt-8 border-primary/30 bg-primary/[0.03]">
            <CardContent className="pt-6">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Target className="h-5 w-5 text-primary" /> Offer plan
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <MiniStat label="Opening bid" value={fmtGBP(a.negotiationGuidance.openingOffer)} />
                <MiniStat label="Target deal price" value={fmtGBP(a.negotiationGuidance.targetOffer)} />
                <MiniStat label="Walk-away ceiling" value={fmtGBP(a.negotiationGuidance.walkAwayOffer)} />
                <MiniStat label="Evidence cap" value={`${(a.negotiationGuidance.maxOpeningDiscountPct * 100).toFixed(1)}%`} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                The investment numbers are underwritten at the target deal price, not the lower opening bid.
              </p>
            </CardContent>
          </Card>
        )}

        {Array.isArray(snap.priceHistory) && snap.priceHistory.length >= 2 && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <History className="h-5 w-5 text-primary" /> Tracked price history
              </h2>
              <ul className="mt-4 space-y-1.5 text-sm">
                {snap.priceHistory.map((h: any, i: number) => (
                  <li key={`${h.date}-${h.value}`} className="flex items-center justify-between gap-3 border-b border-dashed pb-1.5 last:border-0">
                    <span className="text-muted-foreground">
                      {fmtHistoryDate(h.date)}
                      {i === 0 && <Badge variant="outline" className="ml-2 h-5 text-[10px]">current</Badge>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{fmtGBP(h.value)}</span>
                      {h.changeFromPrevious != null && h.changeFromPrevious !== 0 && (
                        <span className={h.changeFromPrevious < 0 ? "text-xs text-emerald-700" : "text-xs text-amber-700"}>
                          ({h.changeFromPrevious < 0 ? "−" : "+"}{fmtGBP(Math.abs(h.changeFromPrevious))})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold">{best?.name} — recommended strategy</h2>
            <p className="mt-1 text-muted-foreground">{best?.summary}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {best?.numbers.map((n: any, i: number) => (
                <div key={i} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{n.label}</p>
                  <p className="text-lg font-semibold">
                    {n.format === "gbp" ? fmtGBP(n.value) : n.format === "pct" ? fmtPct(n.value) : Math.round(n.value * 100) / 100}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold">Strategy comparison</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {a.strategies.map((s: any) => (
                <div key={s.key} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{s.name}</p>
                    <Badge variant={s.dealScore >= 60 ? "default" : "outline"}>{s.dealScore}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold">Negotiation leverage</h2>
            <div className="mt-4 space-y-3">
              {a.negotiation.map((n: any, i: number) => (
                <div key={i} className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground">{n.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary">−{fmtGBP(n.gbp_impact)}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">{n.confidence}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {ai && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Sparkles className="h-4 w-4 text-accent" /> Surveyor AI condition report
              </h2>
              <p className="mt-2 text-muted-foreground">{ai.summary}</p>
              {ai.items?.length > 0 && (
                <div className="mt-4 space-y-2">
                  {ai.items.map((it: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-3 rounded-md border p-3">
                      <div>
                        <p className="font-medium capitalize">{it.area}: {it.issue}</p>
                        <Badge variant="outline" className="mt-1 capitalize">{it.severity}</Badge>
                      </div>
                      <div className="font-semibold">{fmtGBP(it.estimateGbp)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {photos.length > 1 && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold">Photos</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {photos.slice(1).map((p: any) => (
                  <img key={p.id} src={p.url} alt="" className="h-40 w-full rounded-md object-cover" />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {floorPlans.length > 0 && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold">Floor plan{floorPlans.length > 1 ? "s" : ""}</h2>
              <div className={`mt-4 grid gap-3 ${floorPlans.length > 1 ? "sm:grid-cols-2" : ""}`}>
                {floorPlans.map((p: any) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-muted/40">
                    <img src={p.url} alt="Floor plan" className="h-[320px] w-full object-contain p-2" loading="lazy" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Generated by Deal Negotiator · {new Date(snap.generatedAt).toLocaleDateString("en-GB")} · Figures are estimates and not investment advice.
        </p>
      </main>
      <AppFooter />
    </div>
  );
}

function KPI({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span> {label}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
