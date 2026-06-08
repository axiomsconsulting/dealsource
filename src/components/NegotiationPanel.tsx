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

  // Opening anchor: stack every justified factor — your most aggressive credible bid. This is the
  // low end; you expect (and want) to move up from here over the rounds below.
  const baseline = asking * (1 - combinedFlexPct);
  const recommendedOffer = Math.max(0, Math.round(baseline - refurbReduction));

  // Walk-away: the ceiling you refuse to cross — by definition HIGHER than your opener (it's where
  // the negotiation ends, not where it starts) and LOWER than asking (paying full asking means
  // there was nothing to negotiate). Grounded in only the slice of your case you'd insist on even
  // under pressure (a fraction of the combined flex) plus half the refurb offset — at the eleventh
  // hour you'd absorb more of the capex into the price than you would on the opener. Clamped so it
  // always lands strictly between the recommended offer and asking.
  const walkAwayFlexPct = combinedFlexPct * 0.4;
  const walkAwayCeiling = asking * (1 - walkAwayFlexPct) - refurbReduction * 0.5;
  const walkAway = asking > 0
    ? Math.min(asking - 1, Math.max(recommendedOffer + 1, Math.round(walkAwayCeiling)))
    : 0;

  // Up to 3 escalating offers between the opener and the walk-away ceiling — never reaching
  // asking. Each round trades a price increment for a specific concession from the seller, so the
  // gap closes through compromise on both sides rather than a one-way climb back to asking.
  const offerLadder = useMemo(() => {
    if (asking <= 0 || walkAway <= recommendedOffer) return [];
    const gap = walkAway - recommendedOffer;
    return [
      {
        round: 1,
        offer: recommendedOffer,
        compromise: "Open here, framed around the evidenced case below (market signals, EPC, condition, refurb capex) — a maths-led number, not a lowball. No compromise needed yet; you're setting the terms of the conversation.",
      },
      {
        round: 2,
        offer: Math.max(recommendedOffer + 1, Math.round(recommendedOffer + gap * 0.45)),
        compromise: "Move up roughly halfway, but only against something of equal value back — e.g. the seller fixes or formally discloses the survey-flagged issues below, throws in fixtures/white goods, or commits to a fixed completion date that removes your holding costs.",
      },
      {
        round: 3,
        offer: walkAway,
        compromise: "Your final position, at the walk-away ceiling — only move here for a concession that changes your numbers (repairs done pre-exchange, contingencies dropped, a completion date that suits your finance). If they won't move off asking past this point, walk — don't concede the rest of the way.",
      },
    ];
  }, [asking, walkAway, recommendedOffer]);

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
              <p className="text-xs text-muted-foreground">
                Walk-away ceiling: <span className="font-medium text-foreground">{fmtGBP(walkAway)}</span> — the most you'd pay before pulling out; always above your opener and below asking ({fmtGBP(asking)}).
              </p>
            </div>
            <Button onClick={() => onApplyOffer(recommendedOffer)}>Apply to deal</Button>
          </div>
        </div>

        {offerLadder.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Negotiation ladder — up to 3 rounds, never to asking</p>
            <div className="space-y-2">
              {offerLadder.map((o) => (
                <div key={o.round} className="flex items-start gap-3 rounded-md border p-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{o.round}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{fmtGBP(o.offer)}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {o.round === 1 ? "Opening offer" : o.round === offerLadder.length ? "Final position (walk-away)" : "Counter-offer"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{o.compromise}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Each round trades a price increment for a concession — the gap closes through compromise on both sides. Your final position stays at {fmtGBP(walkAway)}, below the {fmtGBP(asking)} asking price; if the seller won't move off asking from there, that's the cue to walk, not to close the rest of the gap yourself.
            </p>
          </div>
        )}
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