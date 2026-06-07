import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Sparkles, Save } from "lucide-react";
import { estimateRefurb, type RefurbTier } from "@/lib/analysis/refurb";
import { fmtGBP } from "@/lib/format";
import { updateProperty } from "@/lib/ingest.functions";
import { toast } from "sonner";

type LineChoice = { include: boolean; tier: "low" | "mid" | "high" };

export function RefurbPanel({
  property,
  onTotalChange,
}: {
  property: any;
  onTotalChange?: (total: number) => void;
}) {
  const initialTier: RefurbTier = property?.refurb_estimate?.tier ?? "medium";
  const [tier, setTier] = useState<RefurbTier>(initialTier);
  const aiItems = property?.ai_payload?.refurb?.items ?? property?.ai_payload?.condition?.items ?? [];
  const est = useMemo(() => estimateRefurb(property, tier, aiItems), [property, tier, aiItems]);

  const qc = useQueryClient();
  const update = useServerFn(updateProperty);

  // user choices keyed by line index
  const stored = property?.refurb_estimate?.user_overrides as Record<string, LineChoice> | undefined;
  const [choices, setChoices] = useState<Record<string, LineChoice>>(() => stored ?? {});
  // when est changes (tier switch), ensure every line has a choice entry
  useEffect(() => {
    setChoices((prev) => {
      const next = { ...prev };
      est.lines.forEach((l, i) => {
        const k = `${l.category}:${i}`;
        if (!next[k]) next[k] = { include: true, tier: "mid" };
      });
      return next;
    });
  }, [est]);

  const live = useMemo(() => {
    let sum = 0;
    const rows = est.lines.map((l, i) => {
      const k = `${l.category}:${i}`;
      const c = choices[k] ?? { include: true, tier: "mid" as const };
      const v = c.tier === "low" ? l.low : c.tier === "high" ? l.high : l.mid;
      if (c.include) sum += v;
      return { l, k, c, value: v };
    });
    const contingency = Math.round(sum * 0.10);
    const total = sum + contingency;
    return { rows, subtotal: sum, contingency, total };
  }, [choices, est]);

  useEffect(() => { onTotalChange?.(live.total); }, [live.total, onTotalChange]);

  const saveMut = useMutation({
    mutationFn: () => update({ data: { id: property.id, patch: { refurb_estimate: { ...est, tier, user_overrides: choices, total: live.total, totalMid: live.subtotal, contingency: live.contingency } as any } } }),
    onSuccess: () => { toast.success("Refurb saved — applied to deal"); qc.invalidateQueries({ queryKey: ["property", property.id] }); },
    onError: (e: any) => toast.error(e.message),
  });

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
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              <Save className="mr-1 h-3 w-3" /> Save & apply
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          {est.notes.join(" · ")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          <Stat label="Selected" v={fmtGBP(live.subtotal)} />
          <Stat label="Contingency 10%" v={fmtGBP(live.contingency)} />
          <Stat label="TOTAL" v={fmtGBP(live.total)} highlight />
          <Stat label="Lines selected" v={`${live.rows.filter((r) => r.c.include).length}/${live.rows.length}`} />
        </div>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Low</th>
                <th className="px-3 py-2 text-right">Mid</th>
                <th className="px-3 py-2 text-right">High</th>
                <th className="px-3 py-2 text-center">Pick</th>
                <th className="px-3 py-2 text-right">Selected</th>
              </tr>
            </thead>
            <tbody>
              {live.rows.map(({ l, k, c, value }, i) => (
                <tr key={i} className={`border-t ${!c.include ? "opacity-40" : ""}`}>
                  <td className="px-3 py-2">
                    <Checkbox checked={c.include} onCheckedChange={(b) => setChoices({ ...choices, [k]: { ...c, include: !!b } })} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.label}</div>
                    {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
                    <div className="text-[10px] text-muted-foreground">{l.qty} {l.unit} · @ {fmtGBP(l.rate)}</div>
                    {l.source === "ai" && <Badge variant="outline" className="mt-1 h-4 text-[9px]">AI</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmtGBP(l.low)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtGBP(l.mid)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmtGBP(l.high)}</td>
                  <td className="px-3 py-2">
                    <ToggleGroup type="single" size="sm" value={c.tier} onValueChange={(v) => v && setChoices({ ...choices, [k]: { ...c, tier: v as any } })} className="justify-center">
                      <ToggleGroupItem value="low" className="h-6 px-2 text-[10px]">L</ToggleGroupItem>
                      <ToggleGroupItem value="mid" className="h-6 px-2 text-[10px]">M</ToggleGroupItem>
                      <ToggleGroupItem value="high" className="h-6 px-2 text-[10px]">H</ToggleGroupItem>
                    </ToggleGroup>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{c.include ? fmtGBP(value) : "—"}</td>
                </tr>
              ))}
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