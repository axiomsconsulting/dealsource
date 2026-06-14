import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { getProperty } from "@/lib/ingest.functions";
import { listPersonas } from "@/lib/personas.functions";
import { getAIAnalysis } from "@/lib/ai.functions";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { analyseProperty } from "@/lib/analysis/engine";
import { buildSurveyStrategy } from "@/lib/analysis/survey-strategy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyViewingCapture } from "@/components/PropertyViewingCapture";
import { fmtGBP } from "@/lib/format";
import {
  ArrowLeft, ListChecks, MessageSquareText, TrendingDown,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/properties/$id_/viewing")({
  validateSearch: z.object({
    tab: z.enum(["before", "capture"]).catch("before"),
  }),
  head: () => ({ meta: [{ title: "Property viewing — Deal Negotiator" }] }),
  component: PropertyViewing,
});

function PropertyViewing() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const getProp = useServerFn(getProperty);
  const listP = useServerFn(listPersonas);
  const getAI = useServerFn(getAIAnalysis);

  const prop = useQuery({ queryKey: ["property", id], queryFn: () => getProp({ data: { id } }) });
  const personasQ = useQuery({ queryKey: ["personas"], queryFn: () => listP({ data: {} } as any) });
  const ai = useQuery({ queryKey: ["ai", id], queryFn: () => getAI({ data: { propertyId: id } }) });
  const personas = (personasQ.data ?? []) as any[];
  const persona = useMemo(() => personas.find((pp) => pp.is_default) ?? personas[0], [personas]);

  const analysis = useMemo(() => {
    if (!prop.data || !persona) return null;
    return analyseProperty(prop.data as any, persona as any, {});
  }, [prop.data, persona]);

  if (prop.isLoading || personasQ.isLoading) {
    return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;
  }
  if (!prop.data || !persona || !analysis) {
    return <AppShell><p>Not found</p></AppShell>;
  }

  const p = prop.data as any;
  const address = p.hide_address ? "Property (address hidden)" : p.address;
  const condition = (ai.data as any)?.ai_payload?.condition;
  const findings: Record<string, any> = p.survey_findings ?? {};
  const toVerify = buildSurveyStrategy(p).filter(
    (issue) => (issue.signal === "flagged" || issue.signal === "watch") && !findings[issue.key]?.active,
  );
  const topPoints = [...analysis.negotiation]
    .sort((a, b) => b.gbp_impact - a.gbp_impact)
    .slice(0, 6);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <Link
          to="/properties/$id"
          params={{ id }}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to property
        </Link>
        <h1 className="mb-1 text-2xl font-bold">{address}</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Property viewing — quick pre-check before you go, and on-site capture while you're there.
        </p>

        <Tabs defaultValue={tab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="before">Before you go</TabsTrigger>
            <TabsTrigger value="capture">On-site capture</TabsTrigger>
          </TabsList>

          <TabsContent value="before" className="space-y-3 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
              {p.baths && <Badge variant="outline">{p.baths} bath</Badge>}
              {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
              {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
              {p.asking_price_gbp && <Badge variant="outline">Asking {fmtGBP(p.asking_price_gbp)}</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Target offer</p>
                <p className="mt-1 text-lg font-semibold">{fmtGBP(analysis.negotiationGuidance.targetOffer)}</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Opening bid</p>
                <p className="mt-1 text-lg font-semibold">{fmtGBP(analysis.negotiationGuidance.openingOffer)}</p>
              </div>
              <div className="rounded-md border bg-card p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Deal score</p>
                <p className="mt-1 text-lg font-semibold">{analysis.overallScore}/100</p>
              </div>
            </div>

            {condition?.summary && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-1 text-sm font-medium">AI condition summary</p>
                <p className="text-sm text-muted-foreground">{condition.summary}</p>
                {condition.score != null && (
                  <p className="mt-1 text-xs text-muted-foreground">Condition score: {condition.score}/10</p>
                )}
              </div>
            )}

            {topPoints.length > 0 && (
              <div className="rounded-md border p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <TrendingDown className="h-4 w-4 text-primary" /> Top negotiation points so far
                </p>
                <ul className="space-y-1.5">
                  {topPoints.map((n, i) => (
                    <li key={i} className="flex items-start justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{n.title}</span>
                      <span className="font-semibold text-primary">−{fmtGBP(n.gbp_impact)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {toVerify.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-900">
                  <ListChecks className="h-4 w-4" /> Things to verify on this viewing
                </p>
                <ul className="space-y-1 text-sm text-amber-900">
                  {toVerify.map((issue) => (
                    <li key={issue.key}>
                      • {issue.title}
                      {issue.evidence && (
                        <span className="text-amber-800/80"> — {issue.evidence}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="capture" className="space-y-3 pt-4">
            <PropertyViewingCapture property={p} />
            {Object.values(findings).some((f: any) => f?.active) && (
              <div className="flex justify-end">
                <Link to="/properties/$id" params={{ id }} hash="negotiation-playbook">
                  <Button variant="outline" size="sm">
                    <MessageSquareText className="mr-2 h-4 w-4" />
                    Review talking points for these findings
                  </Button>
                </Link>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
