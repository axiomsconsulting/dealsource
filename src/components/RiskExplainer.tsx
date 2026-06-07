import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ShieldAlert, AlertTriangle, ShieldCheck, Lightbulb } from "lucide-react";
import { RISK_IMPROVEMENTS, type RiskFlag } from "@/lib/analysis/risk";

export function RiskExplainer({ flags, score }: { flags: RiskFlag[] | undefined | null; score?: number | null }) {
  const fs = flags ?? [];
  const red = fs.filter((f) => f.severity === "red");
  const amber = fs.filter((f) => f.severity === "amber");
  if (fs.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" /> No risk flags — listing reads as a standard, lettable dwelling.
      </div>
    );
  }
  return (
    <Accordion type="single" collapsible className="rounded-md border bg-muted/20 px-3">
      <AccordionItem value="risk" className="border-0">
        <AccordionTrigger className="py-2 text-xs hover:no-underline">
          <span className="flex items-center gap-2">
            {red.length ? <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
            <span className="font-medium">Risk breakdown · {fs.length} flag{fs.length > 1 ? "s" : ""}</span>
            <span className="text-muted-foreground">
              ({red.length} red, {amber.length} amber{score != null ? ` · deal score ${score}` : ""})
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-2 pb-3 text-xs">
          {fs.map((f, i) => (
            <div key={i} className={`rounded-md border p-2 ${f.severity === "red" ? "border-destructive/50 bg-destructive/5" : "border-amber-300 bg-amber-50/60"}`}>
              <div className="flex items-center gap-2">
                {f.severity === "red" ? <ShieldAlert className="h-3 w-3 text-destructive" /> : <AlertTriangle className="h-3 w-3 text-amber-700" />}
                <span className="font-semibold">{f.label}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">{f.severity}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{f.reason}</p>
              {RISK_IMPROVEMENTS[f.key] && (
                <div className="mt-1.5 flex items-start gap-1.5 rounded bg-background/70 p-1.5">
                  <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <p><span className="font-medium">What to do:</span> {RISK_IMPROVEMENTS[f.key]}</p>
                </div>
              )}
            </div>
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}