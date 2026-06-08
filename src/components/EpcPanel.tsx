import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, RefreshCw, Zap } from "lucide-react";
import { fetchEpcForProperty, getEpcForProperty, EPC_BANDS, bandForScore } from "@/lib/epc.functions";
import { buildEpcRoadmap } from "@/lib/analysis/epc-plan";
import { fmtGBP } from "@/lib/format";
import { toast } from "sonner";

const EFF_LABEL_COLOR: Record<string, string> = {
  "very good": "text-emerald-700 bg-emerald-50 border-emerald-200",
  good: "text-green-700 bg-green-50 border-green-200",
  average: "text-amber-700 bg-amber-50 border-amber-200",
  poor: "text-orange-700 bg-orange-50 border-orange-200",
  "very poor": "text-red-700 bg-red-50 border-red-200",
};

export function EpcPanel({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const getEpc = useServerFn(getEpcForProperty);
  const fetchEpc = useServerFn(fetchEpcForProperty);

  const q = useQuery({ queryKey: ["epc", propertyId], queryFn: () => getEpc({ data: { propertyId } }) });
  const epc: any = (q.data as any)?.epc_data ?? null;
  const fetchedAt: string | null = (q.data as any)?.epc_fetched_at ?? null;

  const mut = useMutation({
    mutationFn: () => fetchEpc({ data: { propertyId } }),
    onSuccess: () => { toast.success("EPC certificate fetched from the register"); qc.invalidateQueries({ queryKey: ["epc", propertyId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const roadmap = useMemo(() => epc ? buildEpcRoadmap(epc) : null, [epc]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-accent" /> EPC — energy performance</span>
          <Button size="sm" variant={epc ? "outline" : "default"} disabled={mut.isPending} onClick={() => mut.mutate()}>
            <RefreshCw className={`mr-1 h-3 w-3 ${mut.isPending ? "animate-spin" : ""}`} />
            {epc ? "Refetch from register" : "Fetch from EPC register"}
          </Button>
        </CardTitle>
        <CardDescription>
          {epc
            ? <>From the government EPC register{epc.matchedByAddress ? "" : " — matched by postcode only, double-check the address below"}{fetchedAt ? ` · cached ${new Date(fetchedAt).toLocaleDateString("en-GB")}` : ""}</>
            : "Pulls the lodged certificate, full element-by-element breakdown and the assessor's costed improvement recommendations straight from the register."}
        </CardDescription>
      </CardHeader>
      {epc && (
        <CardContent className="space-y-6">
          {epc.address && (
            <p className="text-xs text-muted-foreground">
              Matched certificate: {epc.address} · lodged {epc.lodgementDate ? new Date(epc.lodgementDate).toLocaleDateString("en-GB") : "unknown date"}
            </p>
          )}

          <EpcChart currentScore={epc.currentScore} currentBand={epc.currentRating} potentialScore={epc.potentialScore} potentialBand={epc.potentialRating} />

          {epc.elements?.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">What the assessment found</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {epc.elements.map((el: any) => (
                  <div key={el.key} className="rounded-md border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium">{el.label}</span>
                      {el.energyEff && (
                        <Badge variant="outline" className={`text-[10px] ${EFF_LABEL_COLOR[el.energyEff.toLowerCase()] ?? ""}`}>{el.energyEff}</Badge>
                      )}
                    </div>
                    {el.description && <p className="text-xs text-muted-foreground">{el.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {roadmap && (
            <div>
              <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-orange-500" /> Improvement roadmap — cheapest first</h4>
              <p className="mb-3 text-xs text-muted-foreground">
                {epc.currentRating}{epc.currentScore != null ? ` (${epc.currentScore})` : ""} → {epc.potentialRating}{epc.potentialScore != null ? ` (${epc.potentialScore})` : ""} is what the assessor says is achievable doing every measure below, for a total indicative spend of {fmtGBP(roadmap.totalCostMin)}–{fmtGBP(roadmap.totalCostMax)}.
                {roadmap.totalAvailablePoints != null && roadmap.totalAvailablePoints > 0 && (
                  <> Sequenced cheapest-first, the markers below estimate where you'd plausibly clear D (≥55) and C (≥69) — the register doesn't publish a per-measure score contribution, so treat these as a sequencing steer rather than a guarantee.</>
                )}
              </p>
              <ol className="space-y-2">
                {roadmap.steps.map((s) => (
                  <li key={s.index} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{s.index}</span>
                          <span className="font-medium">{s.summary}</span>
                          {s.crossesIntoD && <Badge className="bg-amber-500 text-[10px] text-white">~ reaches D here</Badge>}
                          {s.crossesIntoC && <Badge className="bg-green-600 text-[10px] text-white">~ reaches C here</Badge>}
                        </div>
                        {s.description && <p className="mt-1 pl-7 text-xs text-muted-foreground">{s.description}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold">{s.costLabel}</div>
                        <div className="text-[10px] text-muted-foreground">cumulative {fmtGBP(s.cumulativeMin)}–{fmtGBP(s.cumulativeMax)}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/** The classic EPC certificate "ladder" — colour bands A–G with markers for the current and
 *  potential SAP scores, drawn to scale (1–100) so the gap between them reads at a glance. */
function EpcChart({ currentScore, currentBand, potentialScore, potentialBand }: {
  currentScore: number | null; currentBand: string | null; potentialScore: number | null; potentialBand: string | null;
}) {
  const pct = (score: number) => Math.min(100, Math.max(0, score));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
        <RatingChip label="Current" band={currentBand} score={currentScore} />
        <RatingChip label="Potential" band={potentialBand} score={potentialScore} />
      </div>
      <div className="relative h-10 overflow-hidden rounded-md border">
        <div className="flex h-full w-full">
          {EPC_BANDS.slice().reverse().map((b) => (
            <div key={b.band} className="relative flex h-full items-center justify-end pr-1.5 text-[11px] font-bold text-white"
              style={{ width: `${b.max - b.min + 1}%`, backgroundColor: b.color }}>
              {b.band}
            </div>
          ))}
        </div>
        {currentScore != null && (
          <Marker pct={pct(currentScore)} label={`Current ${currentScore}`} className="border-slate-900" />
        )}
        {potentialScore != null && potentialScore !== currentScore && (
          <Marker pct={pct(potentialScore)} label={`Potential ${potentialScore}`} className="border-slate-500 border-dashed" />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>1 (lowest efficiency)</span>
        <span>100 (highest efficiency)</span>
      </div>
    </div>
  );
}

function Marker({ pct, label, className }: { pct: number; label: string; className?: string }) {
  return (
    <div className="absolute top-0 h-full" style={{ left: `${pct}%` }} title={label}>
      <div className={`h-full w-0 border-l-2 ${className}`} />
    </div>
  );
}

function RatingChip({ label, band, score }: { label: string; band: string | null; score: number | null }) {
  const b = EPC_BANDS.find((x) => x.band === (band ?? bandForScore(score)));
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex h-7 w-7 items-center justify-center rounded font-bold text-white" style={{ backgroundColor: b?.color ?? "#999" }}>
        {band ?? "?"}
      </span>
      {score != null && <span className="text-xs text-muted-foreground">({score}/100)</span>}
    </div>
  );
}
