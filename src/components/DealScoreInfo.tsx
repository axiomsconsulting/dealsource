import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OverallScoreBreakdown, StrategyResult } from "@/lib/analysis/types";

/** Info-icon popover that shows the deal score's arithmetic end to end — the lead strategy's
 *  weighted components, then how the six strategy scores roll up into the headline number —
 *  so "62/100" can be hand-checked rather than taken on faith. */
export function DealScoreInfo({ overallScore, breakdown, best }: {
  overallScore: number;
  breakdown: OverallScoreBreakdown;
  best: StrategyResult;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="How the deal score is calculated"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] text-sm">
        <p className="font-medium">How the deal score is calculated</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every figure below comes from this property's own numbers — the same formula run on the same
          inputs always reproduces the same score.
        </p>

        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Lead strategy — {best.name} ({best.dealScore}/100)
          </p>
          {best.scoreBreakdown?.map((c, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-xs">
              <div>
                <span className="font-medium text-foreground">{c.label}</span>
                <p className="text-muted-foreground">{c.detail}</p>
              </div>
              <span className="shrink-0 font-medium tabular-nums">
                {c.points >= 0 ? "+" : ""}{c.points}{c.max != null ? ` / ${c.max}` : ""}
              </span>
            </div>
          ))}
          {best.scoreFormula && <p className="border-t pt-1.5 text-[11px] italic text-muted-foreground">{best.scoreFormula}</p>}
        </div>

        <div className="mt-4 space-y-1.5 border-t pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overall score — every strategy</p>
          {breakdown.strategyScores.map((s) => (
            <div key={s.key} className="flex items-center justify-between text-xs">
              <span className={cn("text-muted-foreground", s.key === best.key && "font-medium text-foreground")}>{s.name}</span>
              <span className="font-medium tabular-nums">{s.score}/100</span>
            </div>
          ))}
          <p className="border-t pt-1.5 text-[11px] text-muted-foreground">
            Average of the six = {breakdown.average} → rounded to {breakdown.cappedAt != null ? Math.round(breakdown.average) : overallScore}.
            {breakdown.cappedAt != null && (
              <> Then capped at <span className="font-medium text-foreground">{breakdown.cappedAt}</span> — {breakdown.capReason}</>
            )}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
