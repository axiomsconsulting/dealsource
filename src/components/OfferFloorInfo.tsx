import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import type { NegotiationGuidance } from "@/lib/analysis/types";
import { fmtGBP, fmtPct } from "@/lib/format";

/** Info-icon popover explaining why the target/walk-away offer doesn't keep falling as refurb
 *  costs and survey findings stack up — and what that floor means for the seller. */
export function OfferFloorInfo({ guidance }: { guidance: NegotiationGuidance }) {
  const cappedByCredibility = guidance.fullLeverage > guidance.askingPrice * guidance.maxOpeningDiscountPct;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Why doesn't the offer keep falling?"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] text-sm">
        <p className="font-medium">Why doesn't the offer keep falling?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every refurb line and survey finding adds to your total evidence (£
          {Math.round(guidance.fullLeverage).toLocaleString()} so far — about{" "}
          {fmtPct(guidance.askingPrice > 0 ? guidance.fullLeverage / guidance.askingPrice : 0)} of asking).
          But the opening offer is capped at a "credible" discount for a {guidance.priceBand} property
          (currently {fmtPct(guidance.maxOpeningDiscountPct)}) — an opener that's far below what an
          agent considers a serious bid usually just gets ignored, regardless of how well-evidenced it is.
        </p>
        {cappedByCredibility && (
          <p className="mt-2 text-xs text-muted-foreground">
            That's why, even though the evidence supports more, the target offer of{" "}
            {fmtGBP(guidance.targetOffer)} and walk-away ceiling of {fmtGBP(guidance.walkAwayOffer)} aren't
            dropping any further from here — the remaining{" "}
            <span className="font-medium text-foreground">{fmtGBP(guidance.retainedLeverage)}</span> of
            evidence is kept in reserve.
          </p>
        )}
        <div className="mt-3 space-y-1.5 border-t pt-3 text-xs">
          <p className="font-medium uppercase tracking-wide text-muted-foreground">What this means for the seller</p>
          <p className="text-muted-foreground">
            Rising refurb costs or extra survey issues don't translate into an ever-lower headline price —
            they get banked as reserve leverage instead. That reserve gets used one of two ways: chipped off
            the price after survey if the issues are confirmed, or used to justify walking away entirely if
            they turn out worse than this offer assumed. Either outcome is worse for the seller than the
            current offer — so it's usually in their interest to address or disclose issues up front rather
            than let them surface later.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
