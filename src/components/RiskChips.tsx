import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { RiskFlag } from "@/lib/analysis/risk";

export function RiskChips({ flags, size = "sm" }: { flags: RiskFlag[] | undefined | null; size?: "sm" | "xs" }) {
  if (!flags?.length) return null;
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex flex-wrap gap-1">
        {flags.map((f, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <Badge
                variant={f.severity === "red" ? "destructive" : "outline"}
                className={
                  size === "xs" ? "h-5 px-1.5 text-[10px]" : "text-xs " +
                  (f.severity === "amber" ? "border-amber-400 bg-amber-50 text-amber-900" : "")
                }
              >
                {f.severity === "red"
                  ? <ShieldAlert className="mr-1 inline h-3 w-3" />
                  : <AlertTriangle className="mr-1 inline h-3 w-3" />}
                {f.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px] text-xs">{f.reason}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}