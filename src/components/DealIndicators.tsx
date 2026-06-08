import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldCheck, ShieldAlert, ShieldQuestion, TrendingUp, TrendingDown, Minus, Sparkles, Target, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealIndicator } from "@/lib/analysis/types";

const TONE_CLASSES: Record<DealIndicator["tone"], string> = {
  good: "border-emerald-300 bg-emerald-50 text-emerald-900",
  neutral: "border-muted-foreground/30 bg-muted/40 text-foreground",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  bad: "border-destructive/40 bg-destructive/5 text-destructive",
};

const ICONS: Record<DealIndicator["key"], Record<DealIndicator["tone"], React.ReactNode>> = {
  risk: {
    good: <ShieldCheck className="h-3 w-3" />,
    neutral: <ShieldQuestion className="h-3 w-3" />,
    warn: <ShieldQuestion className="h-3 w-3" />,
    bad: <ShieldAlert className="h-3 w-3" />,
  },
  income: {
    good: <TrendingUp className="h-3 w-3" />,
    neutral: <Minus className="h-3 w-3" />,
    warn: <Minus className="h-3 w-3" />,
    bad: <TrendingDown className="h-3 w-3" />,
  },
  reward: {
    good: <Sparkles className="h-3 w-3" />,
    neutral: <Target className="h-3 w-3" />,
    warn: <Gauge className="h-3 w-3" />,
    bad: <Gauge className="h-3 w-3" />,
  },
};

/** Badges that translate the deal score into plain-language reads — risk level, income shape,
 *  upside potential — each backed by a tooltip explaining exactly which figures produced it. */
export function DealIndicators({ indicators, className }: { indicators: DealIndicator[] | undefined | null; className?: string }) {
  if (!indicators?.length) return null;
  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {indicators.map((ind) => (
          <Tooltip key={ind.key}>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={cn("gap-1 text-xs", TONE_CLASSES[ind.tone])}>
                {ICONS[ind.key][ind.tone]}
                {ind.value}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px] text-xs">{ind.detail}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
