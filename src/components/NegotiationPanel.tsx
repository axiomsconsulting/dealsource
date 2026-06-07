import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fmtGBP } from "@/lib/format";
import { Handshake, Sparkles, Loader2, TrendingDown } from "lucide-react";
import { SELLER_CIRCUMSTANCES, circumstanceFlexPct, type SellerContext } from "@/lib/seller-context";
import { estimateSellerFlex } from "@/lib/ai.functions";
import { updateProperty } from "@/lib/ingest.functions";
import { toast } from "sonner";

export function NegotiationPanel({
  property,
  refurbTotal,
  onApplyOffer,
}: {
  property: any;
  refurbTotal: number;
  onApplyOffer: (gbp: number) => void;
}) {
  const qc = useQueryClient();
  const flexFn = useServerFn(estimateSellerFlex);
  const update = useServerFn(updateProperty);
  const [flex, setFlex] = useState<any>(null);
  const ctx: SellerContext = (property.seller_context as any) ?? {};
  const [local, setLocal] = useState<SellerContext>(ctx);

  const flexMut = useMutation({
    mutationFn: () => flexFn({ data: { propertyId: property.id } }),
    onSuccess: (r: any) => { setFlex(r); toast.success("Seller flex estimated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (patch: SellerContext) => update({ data: { id: property.id, patch: { seller_context: patch as any } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property", property.id] }),
  });

  const toggle = (key: string, active: boolean) => {
    const next = { ...local, circumstances: { ...(local.circumstances ?? {}), [key]: { ...(local.circumstances?.[key] ?? {}), active } } };
    setLocal(next);
    saveMut.mutate(next);
  };
  const setNote = (key: string, note: string) => {
    const next = { ...local, circumstances: { ...(local.circumstances ?? {}), [key]: { ...(local.circumstances?.[key] ?? { active: false }), note } } };
    setLocal(next);
  };

  const asking = Number(property.asking_price_gbp ?? 0);
  const circFlex = useMemo(() => circumstanceFlexPct(local), [local]);
  const compMid = flex?.reductionPctMid ?? 0.05;
  const combinedFlexPct = Math.min(0.25, compMid + circFlex);
  const refurbReduction = Math.min(refurbTotal, asking * 0.15);
  const baseline = asking * (1 - combinedFlexPct);
  const recommendedOffer = Math.max(0, Math.round(baseline - refurbReduction));
  const walkAway = Math.max(0, Math.round(asking * (1 - Math.min(0.3, combinedFlexPct + 0.05)) - refurbReduction));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Handshake className="h-4 w-4" /> Smart negotiation</span>
          <Button size="sm" variant="outline" disabled={flexMut.isPending} onClick={() => flexMut.mutate()}>
            {flexMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            AI comparables
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {flex && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-primary" />
              <span className="font-medium">Typical reduction in this area: {(flex.reductionPctLow * 100).toFixed(1)}% – {(flex.reductionPctHigh * 100).toFixed(1)}%</span>
              <Badge variant="outline" className="ml-auto capitalize">{flex.marketTemp}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{flex.rationale}</p>
            {flex.comparables?.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                {flex.comparables.map((c: any, i: number) => <li key={i}>{c.note}{c.gbp ? ` — ${fmtGBP(c.gbp)}` : ""}</li>)}
              </ul>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seller circumstances (log what you know)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SELLER_CIRCUMSTANCES.map((c) => {
              const v = local.circumstances?.[c.key];
              return (
                <div key={c.key} className={`rounded-md border p-2 ${v?.active ? "border-primary bg-primary/5" : ""}`}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <Checkbox checked={!!v?.active} onCheckedChange={(b) => toggle(c.key, !!b)} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{c.label}</span>
                        <span className={`text-xs ${c.flexPct >= 0 ? "text-primary" : "text-destructive"}`}>{c.flexPct >= 0 ? "+" : ""}{(c.flexPct * 100).toFixed(1)}%</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{c.hint}</p>
                      {v?.active && (
                        <Input
                          placeholder="Optional note (source, evidence)"
                          value={v.note ?? ""}
                          onChange={(e) => setNote(c.key, e.target.value)}
                          onBlur={() => saveMut.mutate(local)}
                          className="mt-1 h-7 text-xs"
                        />
                      )}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-primary bg-primary/5 p-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Cell label="Asking" v={fmtGBP(asking)} />
            <Cell label="Comparables flex" v={`${(compMid * 100).toFixed(1)}%`} />
            <Cell label="Circumstance flex" v={`${circFlex >= 0 ? "+" : ""}${(circFlex * 100).toFixed(1)}%`} />
            <Cell label="Refurb chip" v={`−${fmtGBP(refurbReduction)}`} />
          </div>
          <div className="mt-3 flex items-end justify-between gap-3 border-t pt-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recommended first offer</p>
              <p className="text-2xl font-bold text-primary">{fmtGBP(recommendedOffer)}</p>
              <p className="text-xs text-muted-foreground">Walk-away: {fmtGBP(walkAway)}</p>
            </div>
            <Button onClick={() => onApplyOffer(recommendedOffer)}>Apply to deal</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Cell({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{v}</p>
    </div>
  );
}