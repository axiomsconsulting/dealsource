import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { AddPropertyDialog } from "@/components/AddPropertyDialog";
import { PropertyNewsPanel } from "@/components/PropertyNewsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listProperties } from "@/lib/ingest.functions";
import { listPersonas } from "@/lib/personas.functions";
import { fetchPropertyNews } from "@/lib/news.functions";
import { analyseProperty } from "@/lib/analysis/engine";
import type { StrategyKey, StrategyResult } from "@/lib/analysis/types";
import { fmtGBP } from "@/lib/format";
import { getGreeting } from "@/lib/greeting";
import { useStrategyFilter } from "@/lib/strategy-filter";
import {
  Sunrise, Sun, Sunset, Moon, Snowflake, Flower2, Leaf,
  ListChecks, Link2, Shuffle, Lightbulb, ArrowRight, Trophy, PartyPopper,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({ meta: [{ title: "Welcome — Deal Negotiator" }] }),
  component: WelcomePage,
});

const TIME_ICONS = { night: Moon, morning: Sunrise, afternoon: Sun, evening: Sunset } as const;
const SEASON_ICONS = { winter: Snowflake, spring: Flower2, summer: Sun, autumn: Leaf } as const;

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  BTL: "Buy-to-Let",
  BRRR: "Buy-Refurb-Refinance-Rent",
  SA: "Serviced Accommodation",
  HMO: "HMO",
  FLIP: "Flip",
  TITLE_SPLIT: "Title Split",
};
const STRATEGY_ORDER: StrategyKey[] = ["BTL", "BRRR", "SA", "HMO", "FLIP", "TITLE_SPLIT"];

interface Tip {
  propertyId: string;
  address: string;
  label: string;
  detail: string;
  source: "risk" | "negotiation" | "indicator";
}

function WelcomePage() {
  const router = useRouter();
  const list = useServerFn(listProperties);
  const personasFn = useServerFn(listPersonas);
  const newsFn = useServerFn(fetchPropertyNews);
  const propsQ = useQuery({ queryKey: ["properties"], queryFn: () => list() });
  const personasQ = useQuery({ queryKey: ["personas"], queryFn: () => personasFn({ data: {} } as any) });
  const newsQ = useQuery({ queryKey: ["property-news"], queryFn: () => newsFn(), staleTime: 10 * 60 * 1000 });

  const greeting = useMemo(() => getGreeting(), []);
  const TimeIcon = TIME_ICONS[greeting.timeOfDay];
  const SeasonIcon = SEASON_ICONS[greeting.season];

  const [tipSeed, setTipSeed] = useState(0);

  const { selected: lensSelected } = useStrategyFilter();
  const personas = (personasQ.data ?? []) as any[];
  const activePersona = personas.find((p) => p.is_default) ?? personas[0];
  const properties = (propsQ.data ?? []) as any[];

  const analysed = useMemo(() => {
    if (!activePersona) return [];
    return properties.map((p) => ({ p, a: analyseProperty(p, activePersona as any) }));
  }, [properties, activePersona]);

  // Highest-scoring property for each strategy — across the whole list, not just feasible ones,
  // so a thin pipeline still surfaces something worth a look.
  const topByStrategy = useMemo(() => {
    const out: Partial<Record<StrategyKey, { property: any; result: StrategyResult }>> = {};
    for (const { p, a } of analysed) {
      for (const sr of a.strategies) {
        if (!lensSelected.includes(sr.key)) continue;
        const cur = out[sr.key];
        if (!cur || sr.dealScore > cur.result.dealScore) out[sr.key] = { property: p, result: sr };
      }
    }
    return out;
  }, [analysed, lensSelected]);

  const strategyOrderInScope = useMemo(() => STRATEGY_ORDER.filter((k) => lensSelected.includes(k)), [lensSelected]);

  const tip = useMemo<Tip | null>(() => {
    const candidates: Tip[] = [];
    for (const { p, a } of analysed) {
      for (const f of a.riskFlags ?? []) {
        candidates.push({ propertyId: p.id, address: p.address, label: f.label, detail: f.reason, source: "risk" });
      }
      for (const n of a.negotiation ?? []) {
        candidates.push({ propertyId: p.id, address: p.address, label: n.title, detail: n.description, source: "negotiation" });
      }
      for (const ind of a.dealIndicators ?? []) {
        candidates.push({ propertyId: p.id, address: p.address, label: ind.label, detail: ind.detail, source: "indicator" });
      }
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysed, tipSeed]);

  const goToRandomProperty = () => {
    if (!properties.length) return;
    const pick = properties[Math.floor(Math.random() * properties.length)];
    router.navigate({ to: "/properties/$id", params: { id: pick.id } });
  };

  const loading = propsQ.isLoading || personasQ.isLoading;

  return (
    <AppShell>
      <div className="space-y-6">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <TimeIcon className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{greeting.salutation}, Negotiator.</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  It's {greeting.dateLabel} — deep in {greeting.seasonLabel}
                  {greeting.periodLabel ? <>, and right in the middle of <span className="font-medium text-foreground">{greeting.periodLabel}</span></> : null}.
                </p>
                <p className="mt-2 max-w-2xl text-sm">{greeting.marketNote}</p>
              </div>
            </div>
            <Badge variant="secondary" className="flex shrink-0 items-center gap-1.5 self-start sm:self-center">
              <SeasonIcon className="h-3.5 w-3.5" /> {greeting.seasonLabel[0].toUpperCase() + greeting.seasonLabel.slice(1)}
            </Badge>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/properties" className="block">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
              <CardContent className="flex items-center justify-between gap-3 pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-2.5"><ListChecks className="h-5 w-5" /></div>
                  <div>
                    <p className="font-semibold">View all properties</p>
                    <p className="text-sm text-muted-foreground">{properties.length} in the pipeline — sort, filter and compare.</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <button onClick={goToRandomProperty} disabled={!properties.length} className="block text-left disabled:cursor-not-allowed disabled:opacity-50">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
              <CardContent className="flex items-center justify-between gap-3 pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-2.5"><Shuffle className="h-5 w-5" /></div>
                  <div>
                    <p className="font-semibold">Surprise me</p>
                    <p className="text-sm text-muted-foreground">Jump into a random property and start working a negotiation angle.</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </button>

          <AddPropertyDialog
            defaultTab="url"
            trigger={
              <button className="block text-left">
                <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                  <CardContent className="flex items-center justify-between gap-3 pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-muted p-2.5"><Link2 className="h-5 w-5" /></div>
                      <div>
                        <p className="font-semibold">Grab a property from a URL</p>
                        <p className="text-sm text-muted-foreground">Paste a Rightmove / Zoopla / OnTheMarket link — we'll scrape and analyse it.</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </button>
            }
          />

          <Card className="h-full">
            <CardContent className="flex items-start justify-between gap-3 pt-6">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-muted p-2.5 text-muted-foreground"><Lightbulb className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="font-semibold">Quick tip</p>
                  {tip ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{tip.label}</span> — {tip.detail}
                      </p>
                      <Link
                        to="/properties/$id"
                        params={{ id: tip.propertyId }}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Found on {tip.address} <ArrowRight className="h-3 w-3" />
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {loading ? "Scanning the pipeline for something worth knowing…" : "Add a few properties and we'll start surfacing things worth knowing about them here."}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setTipSeed((s) => s + 1)} disabled={!tip} title="Show another tip">
                <Shuffle className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <CollapsibleCard
          icon={<Trophy className="h-5 w-5 text-primary" />}
          title="Top property by strategy"
          summary={`${Object.keys(topByStrategy).length} of ${strategyOrderInScope.length} strategies covered`}
        >
          {!activePersona && !loading && (
            <p className="text-sm text-muted-foreground">Set up an investment profile to see strategy scores.</p>
          )}
          {activePersona && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {strategyOrderInScope.map((key) => {
                const top = topByStrategy[key];
                const tile = (
                  <div className="flex h-full flex-col justify-between rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{STRATEGY_LABELS[key]}</p>
                      {top ? (
                        <>
                          <p className="mt-1 truncate text-sm font-semibold">{top.property.address}</p>
                          <p className="truncate text-xs text-muted-foreground">{fmtGBP(top.property.asking_price_gbp)}</p>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">No candidates yet</p>
                      )}
                    </div>
                    {top && (
                      <div className="mt-3 flex items-center justify-between">
                        <Badge variant={top.result.feasible ? "secondary" : "outline"}>
                          {top.result.dealScore}/100
                        </Badge>
                        {!top.result.feasible && <span className="text-xs text-muted-foreground">not feasible</span>}
                      </div>
                    )}
                  </div>
                );
                if (!top) return <div key={key} className="opacity-60">{tile}</div>;
                return (
                  <Link key={key} to="/properties/$id" params={{ id: top.property.id }} className="block">
                    {tile}
                  </Link>
                );
              })}
            </div>
          )}
        </CollapsibleCard>

        {greeting.periodLabel && (
          <Card className="border-dashed">
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <PartyPopper className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Worth knowing</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription>{greeting.marketNote}</CardDescription>
            </CardContent>
          </Card>
        )}

        <PropertyNewsPanel
          articles={(newsQ.data ?? []) as any[]}
          isLoading={newsQ.isLoading}
          onRefresh={() => newsQ.refetch()}
        />
      </div>
    </AppShell>
  );
}
