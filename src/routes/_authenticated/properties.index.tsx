import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { listProperties, deleteProperty } from "@/lib/ingest.functions";
import { listPersonas } from "@/lib/personas.functions";
import { analyseLibraryWithAI } from "@/lib/ai.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyseProperty } from "@/lib/analysis/engine";
import { maxRiskSeverity } from "@/lib/analysis/risk";
import { RiskChips } from "@/components/RiskChips";
import { fmtGBP } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, ExternalLink, Sparkles, Loader2, EyeOff, Eye, Home } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({ meta: [{ title: "Properties — Deal Sourcer" }] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listProperties);
  const personasFn = useServerFn(listPersonas);
  const del = useServerFn(deleteProperty);
  const runAll = useServerFn(analyseLibraryWithAI);
  const props = useQuery({ queryKey: ["properties"], queryFn: () => list() });
  const personasQ = useQuery({ queryKey: ["personas"], queryFn: () => personasFn({ data: {} } as any) });
  const personas = (personasQ.data ?? []) as any[];
  const activePersona = personas.find((p) => p.is_default) ?? personas[0];
  const [hideFlagged, setHideFlagged] = useState(false);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["properties"] }); },
  });
  const aiAll = useMutation({
    mutationFn: () => runAll({ data: { limit: 20, force: false } }),
    onSuccess: (r: any) => { toast.success(`AI analysed ${r.processed} (${r.failed} failed)`); qc.invalidateQueries({ queryKey: ["properties"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const data = (props.data ?? []) as any[];
    const enriched = data.map((p) => {
      const a = activePersona ? analyseProperty(p, activePersona as any) : null;
      const sev = maxRiskSeverity(a?.riskFlags as any);
      return { p, a, sev };
    });
    const filtered = hideFlagged ? enriched.filter((r) => r.sev !== "red") : enriched;
    return filtered.sort((x, y) => {
      const sevOrder: any = { none: 0, amber: 1, red: 2 };
      if (sevOrder[x.sev] !== sevOrder[y.sev]) return sevOrder[x.sev] - sevOrder[y.sev];
      return (y.a?.overallScore ?? 0) - (x.a?.overallScore ?? 0);
    });
  }, [props.data, activePersona, hideFlagged]);

  return (
    <AppShell title={`All properties (${props.data?.length ?? 0})`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="hide-flagged" checked={hideFlagged} onCheckedChange={setHideFlagged} />
          <Label htmlFor="hide-flagged" className="text-sm">
            {hideFlagged ? <EyeOff className="mr-1 inline h-3 w-3" /> : <Eye className="mr-1 inline h-3 w-3" />}
            Hide high-risk listings
          </Label>
        </div>
        <Button variant="outline" size="sm" disabled={aiAll.isPending || !(props.data?.length)} onClick={() => aiAll.mutate()}>
          {aiAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          AI-analyse library (1 credit / property)
        </Button>
      </div>
      {!props.data?.length ? (
        <Card className="p-12 text-center text-muted-foreground">
          No properties yet. <Link to="/dashboard" className="text-primary underline">Add some</Link>.
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map(({ p, a }) => {
            const best = a?.strategies.find((s) => s.key === a.bestStrategy);
            const hero = (p.image_urls?.[0]) ?? null;
            // best-fit persona = highest-score persona where persona match passes
            let bestFit: { name: string; score: number; strategy: string } | null = null;
            if (personas.length) {
              for (const per of personas) {
                const an = analyseProperty(p, per as any);
                if (!an.personaMatch.pass) continue;
                if (!bestFit || an.overallScore > bestFit.score) {
                  bestFit = { name: per.name, score: an.overallScore, strategy: per.strategy };
                }
              }
            }
            return (
              <Card key={p.id} className="overflow-hidden p-0">
                <div className="flex items-stretch gap-4">
                  <div className="hidden h-32 w-44 shrink-0 bg-muted sm:block">
                    {hero ? (
                      <img src={hero} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground"><Home className="h-8 w-8" /></div>
                    )}
                  </div>
                  <div className="flex flex-1 items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/properties/$id" params={{ id: p.id }} className="font-semibold hover:underline">
                        {p.address}
                      </Link>
                      {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
                      {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
                      {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
                      {bestFit ? (
                        <Badge className="bg-accent text-accent-foreground" title={`Best fit: ${bestFit.name} (${bestFit.score}/100)`}>
                          ◆ {bestFit.name}
                        </Badge>
                      ) : personas.length > 0 ? (
                        <Badge variant="outline" className="text-amber-700">No persona fit</Badge>
                      ) : null}
                      {p.source_link && (
                        <a href={p.source_link} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                          <ExternalLink className="inline h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {a?.riskFlags?.length ? <div className="mt-2"><RiskChips flags={a.riskFlags as any} /></div> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span>Asking {fmtGBP(p.asking_price_gbp)}</span>
                      {a && <span>Best: <span className="font-medium text-foreground">{best?.name}</span> · {best?.dealScore}/100</span>}
                      {a && !a.personaMatch.pass && <span className="text-amber-700">Persona mismatch</span>}
                      {p.article4_status === "inside" && <Badge variant="outline" className="border-amber-400 text-amber-800">Article 4</Badge>}
                    </div>
                    {a && best && <p className="mt-1 text-xs text-muted-foreground">{best.summary}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {a && (
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${a.overallScore >= 60 ? "text-primary" : a.overallScore >= 40 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {a.overallScore}
                        </div>
                        <div className="text-xs text-muted-foreground">deal score</div>
                      </div>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => delMut.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}