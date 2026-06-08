import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BedDouble, Loader2, ShowerHead, Sparkles, UtensilsCrossed } from "lucide-react";
import { analyseHmoLayout, getAIAnalysis } from "@/lib/ai.functions";
import { toast } from "sonner";

/** Floor-plan-driven HMO/SA conversion assessment, shown alongside the floor plan(s) it's based
 *  on. Two layers, kept visually distinct: a deterministic floor-area ceiling against the
 *  statutory minimum HMO bedroom size (arithmetic — can't be wrong), and an AI read of the actual
 *  drawn layout for room-by-room ensuite/kitchenette feasibility (judgement — caveated as such). */
export function HmoLayoutPanel({ propertyId, hasFloorPlan }: { propertyId: string; hasFloorPlan: boolean }) {
  const qc = useQueryClient();
  const getAI = useServerFn(getAIAnalysis);
  const runLayout = useServerFn(analyseHmoLayout);

  const ai = useQuery({ queryKey: ["ai", propertyId], queryFn: () => getAI({ data: { propertyId } }) });
  const layout: any = (ai.data as any)?.ai_payload?.hmoLayout ?? null;
  const areaEstimate = layout?.areaEstimate;

  const mut = useMutation({
    mutationFn: () => runLayout({ data: { propertyId } }),
    onSuccess: () => { toast.success("Floor plan layout analysed"); qc.invalidateQueries({ queryKey: ["ai", propertyId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!hasFloorPlan) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><BedDouble className="h-4 w-4 text-accent" /> HMO / SA layout assessment</span>
          <Button size="sm" variant={layout ? "outline" : "default"} disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1.5 h-3 w-3" />}
            {layout ? "Re-analyse floor plan" : "Analyse floor plan for HMO/SA"}
          </Button>
        </CardTitle>
        <CardDescription>
          How many lettable rooms this layout can realistically support, and where there's room for an ensuite — or a fully self-contained ensuite + kitchenette unit for serviced accommodation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {areaEstimate && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Floor-area ceiling — statutory minimum bedroom size</p>
            <p className="mt-1 text-muted-foreground">
              {areaEstimate.totalAreaSqm}m² total, reserving ~{Math.round(areaEstimate.communalReservePct * 100)}% (~{Math.round(areaEstimate.totalAreaSqm * areaEstimate.communalReservePct)}m²) for kitchen/bathrooms/circulation
              leaves ~{areaEstimate.lettableAreaSqm}m² lettable. At the statutory minimum single-occupant bedroom size ({areaEstimate.minRoomSqm}m² — The Licensing and Management of HMOs (Additional Provisions) (England) Regulations 2007),
              that's a hard ceiling of <span className="font-semibold text-foreground">{areaEstimate.maxRooms} room{areaEstimate.maxRooms === 1 ? "" : "s"}</span>. This figure is arithmetic against a published standard — not an estimate.
            </p>
          </div>
        )}

        {layout ? (
          <>
            {layout.summary && <p className="text-sm text-muted-foreground">{layout.summary}</p>}

            {layout.recommendedRooms != null && (
              <p className="text-sm">
                AI's read of the actual floor plan: <span className="font-semibold">{layout.recommendedRooms} lettable room{layout.recommendedRooms === 1 ? "" : "s"}</span> achievable within the layout shown.
              </p>
            )}

            {layout.rooms?.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ShowerHead className="h-4 w-4 text-sky-600" /> Proposed room-by-room conversion</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {layout.rooms.map((r: any, i: number) => (
                    <div key={i} className="rounded-md border p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-medium">{r.label}</span>
                        {r.approxSqm != null && <Badge variant="outline" className="text-[10px]">~{r.approxSqm}m²</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {r.meetsMinStandard != null && (
                          <Badge className={`text-[10px] ${r.meetsMinStandard ? "bg-emerald-600" : "bg-destructive"} text-white`}>
                            {r.meetsMinStandard ? "Meets min. standard" : "Below min. standard"}
                          </Badge>
                        )}
                        {r.ensuitePossible != null && (
                          <Badge variant="outline" className={`text-[10px] ${r.ensuitePossible ? "border-sky-300 bg-sky-50 text-sky-700" : "text-muted-foreground"}`}>
                            {r.ensuitePossible ? "Ensuite feasible" : "No room for ensuite"}
                          </Badge>
                        )}
                      </div>
                      {r.notes && <p className="mt-1.5 text-xs text-muted-foreground">{r.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {layout.saUnits?.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><UtensilsCrossed className="h-4 w-4 text-orange-500" /> Self-contained units for SA strategy</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {layout.saUnits.map((u: any, i: number) => (
                    <div key={i} className="rounded-md border p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-medium">{u.label}</span>
                        {u.approxSqm != null && <Badge variant="outline" className="text-[10px]">~{u.approxSqm}m²</Badge>}
                      </div>
                      {u.ensuiteAndKitchenettePossible != null && (
                        <Badge className={`text-[10px] ${u.ensuiteAndKitchenettePossible ? "bg-emerald-600" : "bg-muted text-muted-foreground"}`}>
                          {u.ensuiteAndKitchenettePossible ? "Ensuite + kitchenette feasible" : "Not viable as self-contained"}
                        </Badge>
                      )}
                      {u.notes && <p className="mt-1.5 text-xs text-muted-foreground">{u.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {layout.caveats && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <span className="font-semibold">Caveats: </span>{layout.caveats}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              The room-by-room read above is the AI's visual judgement of the floor plan — a steer for site-visit verification, not a substitute for a surveyor or your local council's HMO amenity standards (which add to, and vary from, the national minimum room sizes used for the ceiling above).
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run the analysis to get a room-by-room conversion proposal from the floor plan — including where there's space for an ensuite, and whether any part of the property could work as a self-contained ensuite + kitchenette unit for serviced accommodation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
