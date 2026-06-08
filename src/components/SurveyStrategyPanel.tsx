import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, HardHat, Search } from "lucide-react";
import { buildSurveyStrategy } from "@/lib/analysis/survey-strategy";
import { fmtGBP } from "@/lib/format";

const SIGNAL_BADGE: Record<string, string> = {
  flagged: "bg-amber-500 text-white",
  watch: "border-sky-300 bg-sky-50 text-sky-700",
  routine: "text-muted-foreground",
};
const SIGNAL_LABEL: Record<string, string> = {
  flagged: "Flagged from the data",
  watch: "Worth watching",
  routine: "Check on every purchase",
};

/** Survey/condition leverage: what to brief the Level 3 surveyor and builder to dig into and
 *  report on, and what a confirmed finding is realistically worth off the price — both as a
 *  repair cost and as a resalability/mortgageability discount. Structural and roof checks are
 *  routine on any purchase; non-standard construction and asbestos likelihood are read from the
 *  EPC register's own construction description and era language where available. */
export function SurveyStrategyPanel({ property }: { property: any }) {
  const issues = buildSurveyStrategy(property);
  const asking = Number(property.asking_price_gbp ?? 0);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-accent" /> Survey & condition leverage</CardTitle>
        <CardDescription>
          What to brief your Level 3 (RICS Building Survey) surveyor and builder to specifically dig into and report on — and what a confirmed finding is realistically worth off the price, both as a repair cost and as a lasting resalability/mortgageability discount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {issues.map((issue) => (
          <div key={issue.key} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{issue.title}</p>
              <Badge className={`text-[10px] ${SIGNAL_BADGE[issue.signal]}`}>{SIGNAL_LABEL[issue.signal]}</Badge>
            </div>
            {issue.evidence && <p className="mt-1.5 text-xs text-muted-foreground">{issue.evidence}</p>}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-muted/30 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><Search className="h-3.5 w-3.5 text-sky-600" /> Brief the surveyor</p>
                <p className="text-xs text-muted-foreground">{issue.surveyorBrief}</p>
              </div>
              <div className="rounded-md bg-muted/30 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><HardHat className="h-3.5 w-3.5 text-orange-500" /> Brief the builder</p>
                <p className="text-xs text-muted-foreground">{issue.builderBrief}</p>
              </div>
            </div>

            <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">If confirmed — markdown to negotiate</span>
                {asking > 0 && (
                  <span className="font-bold">
                    {fmtGBP(Math.round(asking * issue.markdownLowPct))} – {fmtGBP(Math.round(asking * issue.markdownHighPct))}
                    <span className="ml-1 font-normal text-amber-800">({Math.round(issue.markdownLowPct * 100)}–{Math.round(issue.markdownHighPct * 100)}% of asking)</span>
                  </span>
                )}
              </div>
              <p className="mt-1">{issue.markdownNote}</p>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">
          These are starting briefs and indicative ranges to anchor the conversation — the actual markdown should always be reconciled against your surveyor's and builder's specific findings and quotes before you put a number to the agent.
        </p>
      </CardContent>
    </Card>
  );
}
