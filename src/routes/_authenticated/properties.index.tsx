import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { listProperties, deleteProperty } from "@/lib/ingest.functions";
import { getOrCreateDefaultPersona } from "@/lib/personas.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyseProperty } from "@/lib/analysis/engine";
import { fmtGBP } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({ meta: [{ title: "Properties — Deal Sourcer" }] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listProperties);
  const persona = useServerFn(getOrCreateDefaultPersona);
  const del = useServerFn(deleteProperty);
  const props = useQuery({ queryKey: ["properties"], queryFn: () => list() });
  const per = useQuery({ queryKey: ["persona-default"], queryFn: () => persona({ data: {} } as any) });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["properties"] }); },
  });

  return (
    <AppShell title={`All properties (${props.data?.length ?? 0})`}>
      {!props.data?.length ? (
        <Card className="p-12 text-center text-muted-foreground">
          No properties yet. <Link to="/dashboard" className="text-primary underline">Add some</Link>.
        </Card>
      ) : (
        <div className="grid gap-4">
          {props.data.map((p: any) => {
            const a = per.data ? analyseProperty(p, per.data as any) : null;
            const best = a?.strategies.find((s) => s.key === a.bestStrategy);
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/properties/$id" params={{ id: p.id }} className="font-semibold hover:underline">
                        {p.address}
                      </Link>
                      {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
                      {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
                      {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
                      {p.source_link && (
                        <a href={p.source_link} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                          <ExternalLink className="inline h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span>Asking {fmtGBP(p.asking_price_gbp)}</span>
                      {a && <span>Best: <span className="font-medium text-foreground">{best?.name}</span> · {best?.dealScore}/100</span>}
                      {a && !a.personaMatch.pass && <span className="text-amber-700">Persona mismatch</span>}
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
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}