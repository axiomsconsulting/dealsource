import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

/** Generic info-icon popover for explaining how a displayed number was derived — a title, an
 *  optional intro line, and a list of label/value rows (each with an optional hint, e.g. a
 *  source link). Generalizes the one-off popovers in DealScoreInfo / InsuranceInfo so new
 *  "where did this number come from" explanations don't need a bespoke component each time. */
export function FormulaInfo({
  title,
  intro,
  rows,
}: {
  title: string;
  intro?: ReactNode;
  rows: { label: string; value: ReactNode; hint?: ReactNode }[];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] text-sm">
        <p className="font-medium">{title}</p>
        {intro && <p className="mt-1 text-xs text-muted-foreground">{intro}</p>}
        <div className="mt-3 space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-xs">
              <div>
                <span className="font-medium text-foreground">{r.label}</span>
                {r.hint && <p className="text-muted-foreground">{r.hint}</p>}
              </div>
              <span className="shrink-0 font-medium tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
