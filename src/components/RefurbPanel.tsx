import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Sparkles } from "lucide-react";
import { estimateRefurb, type RefurbTier } from "@/lib/analysis/refurb";
import { fmtGBP } from "@/lib/format";

export function RefurbPanel({ property }: { property: any }) {
  const initialTier: RefurbTier = property?.refurb_estimate?.tier ?? "medium";
  const [tier, setTier] = useState<RefurbTier>(initialTier);
  const aiItems = property?.ai_payload?.refurb?.items ?? property?.ai_payload?.condition?.items ?? [];
  const est = useMemo(() => estimateRefurb(property, tier, aiItems), [property, tier, aiItems]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Refurb estimator</span>
          <div className="flex items-center gap-2">
            {aiItems.length > 0 && <Badge className="bg-accent text-accent-foreground"><Sparkles className="mr-1 h-3 w-3" />AI augmented</Badge>}
            <Select value={tier} onValueChange={(v) => setTier(v as RefurbTier)}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light refresh</SelectItem>
                <SelectItem value="medium">Medium refurb</SelectItem>
                <SelectItem value="heavy">Heavy refurb</SelectItem>
                <SelectItem value="full_gut">Full gut</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
        <CardDescription>
          {est.notes.join(" · ")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          <Stat label="Low" v={fmtGBP(est.totalLow)} />
          <Stat label="Mid" v={fmtGBP(est.totalMid)} highlight />
          <Stat label="High" v={fmtGBP(est.totalHigh)} />
          <Stat label="Total + 10%" v={fmtGBP(est.total)} highlight />
        </div>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Low</th>
                <th className="px-3 py-2 text-right">Mid</th>
                <th className="px-3 py-2 text-right">High</th>
              </tr>
            </thead>
            <tbody>
              {est.lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.label}</div>
                    {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
                    {l.source === "ai" && <Badge variant="outline" className="mt-1 h-4 text-[9px]">AI</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">{l.qty} {l.unit}</td>
                  <td className="px-3 py-2 text-right">{fmtGBP(l.rate)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmtGBP(l.low)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtGBP(l.mid)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmtGBP(l.high)}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2">10% contingency</td>
                <td colSpan={3} />
                <td className="px-3 py-2 text-right">{fmtGBP(est.contingency)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, v, highlight }: { label: string; v: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "border-primary bg-primary/5" : ""}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-semibold ${highlight ? "text-primary" : ""}`}>{v}</p>
    </div>
  );
}