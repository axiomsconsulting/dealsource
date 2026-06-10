import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import type { InsuranceEstimate } from "@/lib/analysis/types";
import { fmtGBP } from "@/lib/format";

/** Info-icon popover that shows how the estimated landlord buildings-insurance premium was
 *  derived — rebuild cost, then each multiplicative risk factor — so the figure can be
 *  hand-checked and used as a starting point for getting real quotes. */
export function InsuranceInfo({ insurance }: { insurance: InsuranceEstimate }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="How the insurance estimate is calculated"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] text-sm">
        <p className="font-medium">Estimated buildings insurance</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A starting point for budgeting and quotes — not a substitute for an actual insurer
          quote, which will also weigh claims history, security and tenant references.
        </p>
        <div className="mt-3 space-y-1 text-xs">
          {insurance.notes.map((n, i) => <p key={i} className="text-muted-foreground">{n}</p>)}
        </div>
        <div className="mt-3 space-y-1.5 border-t pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Risk factors applied</p>
          {insurance.factors.map((f, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-xs">
              <div>
                <span className="font-medium text-foreground">{f.label}</span>
                <p className="text-muted-foreground">{f.detail}</p>
              </div>
              <span className="shrink-0 font-medium tabular-nums text-amber-700">+{Math.round(f.impactPct * 100)}%</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm">
          <span className="font-medium">Estimated annual premium</span>
          <span className="font-semibold">{fmtGBP(insurance.annualPremiumGbp)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
