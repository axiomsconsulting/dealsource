import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fmtGBP } from "@/lib/format";
import { Sparkles, Loader2, TrendingDown } from "lucide-react";
import {
  SELLER_CIRCUMSTANCES,
  circumstanceFlexPct,
  inferSellerCircumstances,
  type SellerContext,
} from "@/lib/seller-context";
import { estimateSellerFlex } from "@/lib/ai.functions";
import { updateProperty } from "@/lib/ingest.functions";
import { toast } from "sonner";
import type { NegotiationGuidance } from "@/lib/analysis/types";

export function NegotiationPanel({
  property,
  guidance,
  onApplyOffer,
  onLiveChange,
}: {
  property: any;
  guidance: NegotiationGuidance;
  onApplyOffer: (gbp: number) => void;
  onLiveChange?: (ctx: SellerContext) => void;
}) {
  const qc = useQueryClient();
  const flexFn = useServerFn(estimateSellerFlex);
  const update = useServerFn(updateProperty);
  const ctx: SellerContext = (property.seller_context as any) ?? {};
  // Pre-tick circumstances inferred from the listing description/keywords — only for
  // circumstances the user hasn't already reviewed (toggled on/off or annotated), so a manual
  // un-tick sticks across reloads while still-unreviewed signals stay surfaced.
  const [local, setLocal] = useState<SellerContext>(() => {
    const inferred = inferSellerCircumstances(property);
    return { ...ctx, circumstances: { ...inferred, ...(ctx.circumstances ?? {}) } };
  });

  const saveMut = useMutation({
    mutationFn: (patch: SellerContext) =>
      update({ data: { id: property.id, patch: { seller_context: patch as any } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property", property.id] }),
  });

  const [aiResult, setAiResult] = useState<any>(null);
  const flexMut = useMutation({
    mutationFn: () => flexFn({ data: { propertyId: property.id } }),
    onSuccess: (r: any) => {
      setAiResult(r);
      const next: SellerContext = {
        ...local,
        aiFlex: { reductionPctMid: r.reductionPctMid, fetchedAt: new Date().toISOString() },
      };
      setLocal(next);
      onLiveChange?.(next);
      saveMut.mutate(next);
      toast.success("Seller flex estimated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (key: string, active: boolean) => {
    const next = {
      ...local,
      circumstances: {
        ...(local.circumstances ?? {}),
        [key]: { ...(local.circumstances?.[key] ?? {}), active },
      },
    };
    setLocal(next);
    onLiveChange?.(next);
    saveMut.mutate(next);
  };
  const setNote = (key: string, note: string) => {
    const next = {
      ...local,
      circumstances: {
        ...(local.circumstances ?? {}),
        [key]: { ...(local.circumstances?.[key] ?? { active: false }), note },
      },
    };
    setLocal(next);
    onLiveChange?.(next);
  };

  const asking = Number(property.asking_price_gbp ?? 0);
  const flex = local.aiFlex ?? null;
  const compMid = flex?.reductionPctMid ?? 0;
  const circFlex = circumstanceFlexPct(local);
  const combinedFlexPct = Math.max(-0.03, Math.min(0.1, compMid + circFlex));

  // guidance.openingOffer/targetOffer/walkAwayOffer already include the seller-context flex
  // (circumstances + AI comparables), computed in buildNegotiation — no local recompute needed.
  const openingOffer = guidance.openingOffer;
  const targetOffer = guidance.targetOffer;
  const walkAway = guidance.walkAwayOffer;

  // Up to 3 escalating offers between the opener and the walk-away ceiling — never reaching
  // asking. Each round trades a price increment for a specific concession from the seller, so the
  // gap closes through compromise on both sides rather than a one-way climb back to asking.
  const offerLadder = useMemo(() => {
    if (asking <= 0 || walkAway <= openingOffer) return [];
    return [
      {
        round: 1,
        offer: openingOffer,
        compromise:
          "Open here, framed around the evidenced case below. This is the anchor, not the price you underwrite the deal at.",
      },
      {
        round: 2,
        offer: targetOffer,
        compromise:
          "This is the working deal price. Move here for something useful back: speed, fixtures, disclosure, access for quotes, or a completion date that protects your finance.",
      },
      {
        round: 3,
        offer: walkAway,
        compromise:
          "Your final position, at the walk-away ceiling — only move here for a concession that changes your numbers (repairs done pre-exchange, contingencies dropped, a completion date that suits your finance). If they won't move off asking past this point, walk — don't concede the rest of the way.",
      },
    ];
  }, [asking, walkAway, openingOffer, targetOffer]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={flexMut.isPending}
          onClick={() => flexMut.mutate()}
        >
          {flexMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          AI comparables
        </Button>
      </div>
      {aiResult && (
        <div className="rounded-md border bg-muted/30 p-2.5 text-sm">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" />
            <span className="font-medium">
              Typical reduction in this area: {(aiResult.reductionPctLow * 100).toFixed(1)}% –{" "}
              {(aiResult.reductionPctHigh * 100).toFixed(1)}%
            </span>
            <Badge variant="outline" className="ml-auto capitalize">
              {aiResult.marketTemp}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{aiResult.rationale}</p>
          {aiResult.comparables?.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
              {aiResult.comparables.map((c: any, i: number) => (
                <li key={i}>
                  {c.note}
                  {c.gbp ? ` — ${fmtGBP(c.gbp)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Seller circumstances (log what you know)
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SELLER_CIRCUMSTANCES.map((c) => {
            const v = local.circumstances?.[c.key];
            return (
              <div
                key={c.key}
                className={`rounded-md border p-2 ${v?.active ? "border-primary bg-primary/5" : ""}`}
              >
                <label className="flex cursor-pointer items-start gap-2">
                  <Checkbox
                    checked={!!v?.active}
                    onCheckedChange={(b) => toggle(c.key, !!b)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{c.label}</span>
                      <span
                        className={`text-xs ${c.flexPct >= 0 ? "text-primary" : "text-destructive"}`}
                      >
                        {c.flexPct >= 0 ? "+" : ""}
                        {(c.flexPct * 100).toFixed(1)}%
                      </span>
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

      <div className="rounded-md border border-primary bg-primary/5 p-2.5">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Cell label="Asking" v={fmtGBP(asking)} />
          <Cell label="Evidence cap" v={`${(guidance.maxOpeningDiscountPct * 100).toFixed(1)}%`} />
          <Cell label="Comparables flex" v={flex ? `${(compMid * 100).toFixed(1)}%` : "not run"} />
          <Cell
            label="Seller context"
            v={`${combinedFlexPct >= 0 ? "+" : ""}${(combinedFlexPct * 100).toFixed(1)}%`}
          />
        </div>
        <div className="mt-2 flex items-end justify-between gap-3 border-t pt-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Target deal price
            </p>
            <p className="text-2xl font-bold text-primary">{fmtGBP(targetOffer)}</p>
            <p className="text-xs text-muted-foreground">
              Open at <span className="font-medium text-foreground">{fmtGBP(openingOffer)}</span>;
              walk away above{" "}
              <span className="font-medium text-foreground">{fmtGBP(walkAway)}</span>.
            </p>
          </div>
          <Button onClick={() => onApplyOffer(targetOffer)}>Apply target to deal</Button>
        </div>
      </div>

      {offerLadder.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Negotiation ladder — up to 3 rounds, never to asking
          </p>
          <div className="space-y-2">
            {offerLadder.map((o) => (
              <div key={o.round} className="flex items-start gap-3 rounded-md border p-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {o.round}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{fmtGBP(o.offer)}</span>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {o.round === 1
                        ? "Opening offer"
                        : o.round === offerLadder.length
                          ? "Final position (walk-away)"
                          : "Counter-offer"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{o.compromise}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Each round trades a price increment for a concession. The model underwrites the deal at{" "}
            {fmtGBP(targetOffer)}, not the opener, so the investment case stays credible under human
            due diligence.
          </p>
        </div>
      )}
    </div>
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
