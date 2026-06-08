import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { getProperty } from "@/lib/ingest.functions";
import { listPersonas } from "@/lib/personas.functions";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { analyseProperty } from "@/lib/analysis/engine";
import { extractPriceHistory, fmtHistoryDate } from "@/lib/analysis/price-history";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RiskChips } from "@/components/RiskChips";
import { DealSheetPanel } from "@/components/DealSheetPanel";
import { fmtGBP } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ArrowRight, Info, Home, Wallet, TrendingUp, Calculator,
  Target, ShieldCheck, Sparkles, CheckCircle2, ListChecks,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/properties/$id/guide")({
  head: () => ({ meta: [{ title: "Guided walkthrough — Deal Negotiator" }] }),
  component: GuidedWalkthrough,
});

const STRATEGY_BLURBS: Record<string, string> = {
  BTL: "Buy-to-let — buy it, rent it out long-term, and collect rental income every month.",
  BRRR: "Buy, Refurbish, Refinance, Rent — add value with a refurb, then refinance to pull most of your cash back out and keep the property as a rental.",
  SA: "Serviced accommodation — short-stay/holiday lets. Often higher income, but more hands-on management (or a managing agent's fee).",
  HMO: "House in multiple occupation — let room-by-room to several tenants. Higher yield, but more regulation, licensing and maintenance.",
  FLIP: "Buy, refurbish and resell quickly for a profit rather than holding it as a rental.",
  TITLE_SPLIT: "Split the legal title into separate units and sell or let them individually — can unlock value trapped in one large title.",
  CUSTOM: "A bespoke approach the engine assembled for this specific opportunity.",
};

/** Inline definition for a metric label — lets a first-time investor hover/tap a term
 *  to learn what it means without leaving the step they're on. */
function Term({ label, def }: { label: ReactNode; def: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-4">{label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-xs">{def}</TooltipContent>
    </Tooltip>
  );
}

function Explainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-primary/30 bg-primary/[0.03] p-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="space-y-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span> {label}
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function GuidedWalkthrough() {
  const { id } = Route.useParams();
  const getProp = useServerFn(getProperty);
  const listP = useServerFn(listPersonas);

  const prop = useQuery({ queryKey: ["property", id], queryFn: () => getProp({ data: { id } }) });
  const personasQ = useQuery({ queryKey: ["personas"], queryFn: () => listP({ data: {} } as any) });
  const personas = (personasQ.data ?? []) as any[];
  const persona = useMemo(() => personas.find((pp) => pp.is_default) ?? personas[0], [personas]);

  const analysis = useMemo(() => {
    if (!prop.data || !persona) return null;
    return analyseProperty(prop.data as any, persona as any, {});
  }, [prop.data, persona]);

  const [step, setStep] = useState(0);

  if (prop.isLoading || personasQ.isLoading) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!prop.data || !persona || !analysis) return <AppShell><p>Not found</p></AppShell>;

  const p = prop.data as any;
  const best = analysis.strategies.find((s) => s.key === analysis.bestStrategy)!;
  const history = extractPriceHistory(p);
  const allImages: string[] = Array.isArray(p.image_urls) ? p.image_urls : [];
  const hero = allImages[0];
  const address = p.hide_address ? "Property (address hidden)" : p.address;
  const discount = analysis.negotiationGuidance.askingPrice > 0
    ? (analysis.negotiationGuidance.askingPrice - analysis.negotiationGuidance.targetOffer) / analysis.negotiationGuidance.askingPrice
    : 0;

  const steps: { key: string; title: string; blurb: ReactNode; render: () => ReactNode }[] = [
    {
      key: "meet",
      title: "Meet the property",
      blurb: (
        <>
          <p>Start by getting a feel for what this place actually <em>is</em> — its type, size and headline facts shape who'd want to live in it and what it could rent or sell for.</p>
          <p>On a viewing, use these as a checklist: does the bed/bath count match what's listed, does the EPC rating look plausible for the property's age, and is the area what you expected?</p>
        </>
      ),
      render: () => (
        <div className="space-y-4">
          {hero && (
            <div className="overflow-hidden rounded-lg border bg-muted">
              <img src={hero} alt={address} className="h-[320px] w-full object-cover" />
            </div>
          )}
          <h2 className="text-xl font-semibold">{address}</h2>
          <div className="flex flex-wrap gap-2">
            {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
            {p.baths && <Badge variant="outline">{p.baths} bath</Badge>}
            {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
            {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
            {p.tenure && <Badge variant="outline">{p.tenure}</Badge>}
            {p.area_sqm && <Badge variant="outline">{Math.round(p.area_sqm)} m²</Badge>}
          </div>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li><Term label="Tenure" def="Freehold means you own the building and the land outright. Leasehold means you own the property for a fixed number of years under a lease from the freeholder — check the years remaining." /> — freehold is simpler; a short lease can be costly to extend.</li>
            <li><Term label="EPC rating" def="Energy Performance Certificate — graded A (best) to G (worst). From 2025/26 many rentals will need at least a C, so anything below is a future cost to budget for." /> — anything below a C may need improving before you can let it.</li>
            <li>Floor area and room count — does it match the photos and the listing's claims?</li>
          </ul>
        </div>
      ),
    },
    {
      key: "numbers",
      title: "The price & the numbers",
      blurb: (
        <>
          <p>These headline figures decide whether a deal is worth pursuing at all. The <Term label="deal score" def="A 0–100 score blending yield, cashflow, return on investment and risk for the recommended strategy — higher is better." /> is the engine's one-number verdict; the rest explain why.</p>
          <p>If there's a tracked price history below, a property that's been reduced more than once is often a seller who's increasingly motivated to do a deal.</p>
        </>
      ),
      render: () => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Fact icon={<Wallet />} label="Asking price" value={fmtGBP(p.asking_price_gbp)} />
            <Fact icon={<TrendingUp />} label={<Term label="Deal score" def="A 0–100 score blending yield, cashflow, ROI and risk for the recommended strategy." />} value={`${analysis.overallScore}/100`} />
            <Fact icon={<Calculator />} label="Best strategy" value={best.name} />
            <Fact icon={<Sparkles />} label={<Term label="Monthly cashflow" def="Rent received minus mortgage payment, management and other running costs each month — the cash left in your pocket." />} value={best.monthlyCashflow != null ? fmtGBP(Math.round(best.monthlyCashflow)) : "—"} />
          </div>
          {history.length >= 2 && (
            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tracked price history</p>
              <ul className="space-y-1 text-sm">
                {history.map((h, i) => (
                  <li key={`${h.date}-${h.value}`} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {fmtHistoryDate(h.date)}
                      {i === 0 && <Badge variant="outline" className="ml-2 h-5 text-[10px]">current</Badge>}
                    </span>
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
              <p className="mt-2 text-xs text-muted-foreground">Repeated reductions are a signal — they suggest the seller may accept an offer below the current asking price.</p>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "strategy",
      title: "Pick a strategy",
      blurb: (
        <>
          <p>A "strategy" is simply <em>how</em> you'd run this property — rent it whole, room-by-room, short-stay, refurbish-and-refinance, or flip it. Each suits different goals, budgets and amounts of hands-on involvement.</p>
          <p>The engine ranks every strategy it can model against your investment profile and highlights the one that scores best here — but the others are shown too, so you can see the trade-offs.</p>
        </>
      ),
      render: () => (
        <div className="space-y-3">
          {analysis.strategies.map((s) => (
            <div
              key={s.key}
              className={cn(
                "rounded-md border p-3",
                s.key === best.key && "border-primary/40 bg-primary/[0.04]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{s.name}</p>
                  {s.key === best.key && <Badge className="bg-primary"><CheckCircle2 className="mr-1 h-3 w-3" /> Recommended</Badge>}
                </div>
                <Badge variant={s.dealScore >= 60 ? "default" : "outline"}>{s.dealScore}/100</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{STRATEGY_BLURBS[s.key] ?? s.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "condition",
      title: "Condition, risk & EPC",
      blurb: (
        <>
          <p>Before you commit, work out what could go wrong and what it'd cost to put right. Risk flags surface anything unusual the engine spotted (planning restrictions, licensing, leasehold issues); the EPC rating hints at how energy-efficient — and how expensive to heat — the property is.</p>
          <p>On a viewing: look for damp, roof condition, the age of the boiler/electrics, and anything that doesn't match the photos. Ask the agent directly about anything flagged here.</p>
        </>
      ),
      render: () => (
        <div className="space-y-4">
          {analysis.riskFlags && analysis.riskFlags.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Risk flags — hover each for why it matters</p>
              <RiskChips flags={analysis.riskFlags as any} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No notable risk flags surfaced for this property.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact icon={<ShieldCheck />} label="EPC rating" value={p.epc_rate ?? "Unknown"} />
            <Fact icon={<Home />} label="Tenure" value={p.tenure ?? "Unknown"} />
          </div>
          {analysis.negotiationGuidance.warnings.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-1 font-medium">Credibility guardrails</p>
              <ul className="list-inside list-disc">
                {analysis.negotiationGuidance.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "negotiation",
      title: "Plan your negotiation",
      blurb: (
        <>
          <p>Every number above can become evidence in a negotiation — price reductions, refurb costs, an EPC below standard, anything that justifies offering less than the asking price. The list below is the engine's weighted case, in order of strength.</p>
          <p>The offer plan turns that case into three numbers: an <Term label="opening bid" def="A deliberately low first offer that leaves room to negotiate upward without overpaying." /> to start the conversation, a <Term label="target deal price" def="The price the engine has underwritten the numbers against — the realistic price you're aiming to land at." /> that the investment numbers assume, and a <Term label="walk-away ceiling" def="The maximum price at which the deal still stacks up — beyond this, the numbers stop working for your strategy." /> beyond which the deal stops making sense. Lead with evidence, not emotion — and be ready to walk away at the ceiling.</p>
        </>
      ),
      render: () => (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Fact icon={<Target />} label="Opening bid" value={fmtGBP(analysis.negotiationGuidance.openingOffer)} />
            <Fact icon={<Target />} label="Target deal price" value={fmtGBP(analysis.negotiationGuidance.targetOffer)} />
            <Fact icon={<Target />} label="Walk-away ceiling" value={fmtGBP(analysis.negotiationGuidance.walkAwayOffer)} />
            <Fact icon={<Calculator />} label="Discount at target" value={`${(discount * 100).toFixed(1)}%`} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Negotiation leverage — strongest first</p>
            {analysis.negotiation.map((n, i) => (
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
        </div>
      ),
    },
    {
      key: "dealsheet",
      title: "Your deal sheet",
      blurb: (
        <>
          <p>You've now reviewed everything an investor would: the property itself, the numbers, the strategy, the risks and the negotiation case. The deal sheet below packages all of it into a single, shareable, one-page summary.</p>
          <p>Generate it, choose what to show or redact, then copy the link or download the PDF — it's the same consolidated deal sheet the advanced view produces.</p>
        </>
      ),
      render: () => (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.03] p-3 text-sm">
            <ListChecks className="h-4 w-4 shrink-0 text-primary" />
            <span>Property reviewed · Numbers checked · Strategy chosen ({best.name}) · Risks noted · Negotiation planned — ready to generate.</span>
          </div>
          <DealSheetPanel propertyId={id} overrides={{}} />
        </div>
      ),
    },
  ];

  const current = steps[step];
  const pct = Math.round(((step + 1) / steps.length) * 100);

  return (
    <TooltipProvider delayDuration={150}>
      <AppShell>
        <div className="mb-6">
          <Link to="/properties/$id" params={{ id }} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to advanced view
          </Link>
          <h1 className="text-2xl font-bold">Guided walkthrough</h1>
          <p className="text-sm text-muted-foreground">{address}</p>
        </div>

        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Step {step + 1} of {steps.length}: {current.title}</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  i === step ? "border-primary bg-primary text-primary-foreground"
                    : i < step ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-muted-foreground/20 text-muted-foreground hover:bg-muted",
                )}
              >
                {i + 1}. {s.title}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <Explainer>{current.blurb}</Explainer>
            {current.render()}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Link to="/properties/$id" params={{ id }}>
              <Button variant="outline">
                Open advanced view <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </AppShell>
    </TooltipProvider>
  );
}
