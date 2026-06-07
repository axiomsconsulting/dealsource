import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { listProperties, deleteProperty } from "@/lib/ingest.functions";
import { listPersonas } from "@/lib/personas.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyseProperty } from "@/lib/analysis/engine";
import { maxRiskSeverity } from "@/lib/analysis/risk";
import { RiskChips } from "@/components/RiskChips";
import { RiskExplainer } from "@/components/RiskExplainer";
import { DealComparisonTable, type ComparisonRow } from "@/components/DealComparisonTable";
import { circumstanceFlexPct } from "@/lib/seller-context";
import { fmtGBP } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, ExternalLink, Home, Download, Filter as FilterIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useMemo, useState } from "react";
import { BatchAIDialog } from "@/components/BatchAIDialog";
import { rowsToCSV, downloadCSV, type ExportRow } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({ meta: [{ title: "Properties — Deal Sourcer" }] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listProperties);
  const personasFn = useServerFn(listPersonas);
  const del = useServerFn(deleteProperty);
  const props = useQuery({ queryKey: ["properties"], queryFn: () => list() });
  const personasQ = useQuery({ queryKey: ["personas"], queryFn: () => personasFn({ data: {} } as any) });
  const personas = (personasQ.data ?? []) as any[];
  const activePersona = personas.find((p) => p.is_default) ?? personas[0];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"score" | "yield" | "price_asc" | "price_desc" | "risk">("score");
  const [minScore, setMinScore] = useState(0);
  const ALL_FLAGS = ["shared_ownership","auction","developer_invitation","land_only","planning_only","fake_or_underpriced","listed_building","retirement_only","leasehold_short"] as const;
  type FlagKey = typeof ALL_FLAGS[number];
  const [hiddenFlags, setHiddenFlags] = useState<Set<FlagKey>>(new Set());

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["properties"] }); },
  });

  const allRows = useMemo(() => {
    const data = (props.data ?? []) as any[];
    return data.map((p) => {
      const a = activePersona ? analyseProperty(p, activePersona as any) : null;
      const sev = maxRiskSeverity(a?.riskFlags as any);
      return { p, a, sev };
    });
  }, [props.data, activePersona]);

  const analysedCount = useMemo(() => allRows.filter((r) => (r.p as any).ai_payload || (r.p as any).analyses?.ai_payload).length, [allRows]);

  const rows = useMemo(() => {
    const filtered = allRows.filter((r) => {
      const flags = (r.a?.riskFlags ?? []) as any[];
      if (flags.some((f) => hiddenFlags.has(f.key))) return false;
      if ((r.a?.overallScore ?? 0) < minScore) return false;
      return true;
    });
    const sevOrder: any = { none: 0, amber: 1, red: 2 };
    return filtered.sort((x, y) => {
      if (sortBy === "risk") {
        if (sevOrder[x.sev] !== sevOrder[y.sev]) return sevOrder[x.sev] - sevOrder[y.sev];
        return (y.a?.overallScore ?? 0) - (x.a?.overallScore ?? 0);
      }
      if (sortBy === "yield") {
        const yx = (x.p as any).estimated_rent_pcm ? ((x.p as any).estimated_rent_pcm * 12) / Math.max(1, (x.p as any).asking_price_gbp) : 0;
        const yy = (y.p as any).estimated_rent_pcm ? ((y.p as any).estimated_rent_pcm * 12) / Math.max(1, (y.p as any).asking_price_gbp) : 0;
        return yy - yx;
      }
      if (sortBy === "price_asc") return ((x.p as any).asking_price_gbp ?? 0) - ((y.p as any).asking_price_gbp ?? 0);
      if (sortBy === "price_desc") return ((y.p as any).asking_price_gbp ?? 0) - ((x.p as any).asking_price_gbp ?? 0);
      // default: deal score
      return (y.a?.overallScore ?? 0) - (x.a?.overallScore ?? 0);
    });
  }, [allRows, hiddenFlags, minScore, sortBy]);

  const toggleSel = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(rows.map((r) => r.p.id)));
  const clearSel = () => setSelected(new Set());

  const exportCSV = () => {
    const pick = selected.size ? rows.filter((r) => selected.has(r.p.id)) : rows;
    if (!pick.length) { toast.error("Nothing to export"); return; }
    const out: ExportRow[] = pick.map(({ p, a, sev }) => {
      const eff = a?.effectiveInputs;
      const rent = (p as any).estimated_rent_pcm ?? eff?.monthly_rent ?? null;
      const gy = rent && p.asking_price_gbp ? (rent * 12) / p.asking_price_gbp : null;
      const cashIn = eff ? (eff.offer_price * (1 - eff.ltv) + (eff.refurb_cost ?? 0) + 6000) : 0;
      const yci = rent && cashIn ? (rent * 12) / cashIn : null;
      const best = a?.strategies.find((s) => s.key === a.bestStrategy);
      const flexPct = circumstanceFlexPct((p as any).seller_context);
      return {
        address: p.address,
        postcode: p.postcode ?? "",
        asking_price: p.asking_price_gbp ?? null,
        recommended_offer: eff ? Math.round(eff.offer_price) : null,
        max_offer: activePersona?.max_offer_gbp ?? null,
        est_rent_pcm: rent,
        gross_yield_pct: gy ? Math.round(gy * 10000) / 100 : null,
        yield_on_cash_in_pct: yci ? Math.round(yci * 10000) / 100 : null,
        refurb_total: eff ? Math.round(eff.refurb_cost ?? 0) : null,
        article4_status: (p as any).article4_status ?? "unknown",
        seller_flex_pct: flexPct ? Math.round(flexPct * 10000) / 100 : 0,
        best_strategy: best?.name ?? "",
        deal_score: a?.overallScore ?? null,
        risk_severity: sev,
        risk_flags: (a?.riskFlags ?? []).map((f: any) => f.label).join("; "),
      };
    });
    downloadCSV(`deal-comparison-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCSV(out));
    toast.success(`Exported ${out.length} properties`);
  };

  const comparisonRows: ComparisonRow[] = useMemo(() => {
    const source = selected.size ? rows.filter((r) => selected.has(r.p.id)) : [];
    return source.map(({ p, a, sev }) => {
      const eff = a?.effectiveInputs;
      const rent = (p as any).estimated_rent_pcm ?? eff?.monthly_rent ?? null;
      const gy = rent && p.asking_price_gbp ? (rent * 12) / p.asking_price_gbp * 100 : null;
      const best = a?.strategies.find((s) => s.key === a.bestStrategy);
      const flex = circumstanceFlexPct((p as any).seller_context);
      return {
        id: p.id,
        address: p.address,
        postcode: p.postcode ?? null,
        asking: p.asking_price_gbp ?? null,
        recommended: eff ? Math.round(eff.offer_price) : null,
        rent: rent ?? null,
        grossYield: gy,
        refurb: eff ? Math.round(eff.refurb_cost ?? 0) : null,
        article4: (p as any).article4_status ?? "unknown",
        sellerFlexPct: flex || null,
        bestStrategy: best?.name ?? "",
        score: a?.overallScore ?? null,
        riskSeverity: sev as any,
        riskCount: (a?.riskFlags ?? []).length,
      };
    });
  }, [rows, selected]);

  return (
    <AppShell title={`All properties (${props.data?.length ?? 0})`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Deal score (high→low)</SelectItem>
            <SelectItem value="yield">Gross yield (high→low)</SelectItem>
            <SelectItem value="price_asc">Price (low→high)</SelectItem>
            <SelectItem value="price_desc">Price (high→low)</SelectItem>
            <SelectItem value="risk">Risk (clean first)</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <FilterIcon className="mr-2 h-4 w-4" /> Filters {hiddenFlags.size > 0 && <Badge variant="secondary" className="ml-2">{hiddenFlags.size}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3">
            <div>
              <Label className="text-xs">Minimum deal score: {minScore}</Label>
              <Slider value={[minScore]} onValueChange={(v) => setMinScore(v[0])} min={0} max={100} step={5} />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hide listings flagged as</p>
              {ALL_FLAGS.map((f) => (
                <label key={f} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={hiddenFlags.has(f)} onCheckedChange={(b) => setHiddenFlags((s) => { const n = new Set(s); b ? n.add(f) : n.delete(f); return n; })} />
                  {f.replace(/_/g, " ")}
                </label>
              ))}
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setHiddenFlags(new Set())}>Clear filters</Button>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex-1" />
        {selected.size > 0 && (
          <span className="text-sm text-muted-foreground">{selected.size} selected · <button className="underline" onClick={clearSel}>clear</button></span>
        )}
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV {selected.size > 0 ? `(${selected.size})` : `(${rows.length})`}
        </Button>
        <BatchAIDialog
          totalProperties={allRows.length}
          alreadyAnalysed={analysedCount}
          onDone={() => qc.invalidateQueries({ queryKey: ["properties"] })}
        />
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={selected.size === rows.length && rows.length > 0} onCheckedChange={(b) => b ? selectAll() : clearSel()} />
        Select all ({rows.length})
      </div>
      {comparisonRows.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deal comparison · {comparisonRows.length} selected</p>
          <DealComparisonTable rows={comparisonRows} />
        </div>
      )}
      {!props.data?.length ? (
        <Card className="p-12 text-center text-muted-foreground">
          No properties yet. <Link to="/dashboard" className="text-primary underline">Add some</Link>.
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map(({ p, a }) => {
            const best = a?.strategies.find((s) => s.key === a.bestStrategy);
            const hero = (p.image_urls?.[0]) ?? null;
            // best-fit persona = highest-score persona where persona match passes
            let bestFit: { name: string; score: number; strategy: string } | null = null;
            if (personas.length) {
              for (const per of personas) {
                const an = analyseProperty(p, per as any);
                if (!an.personaMatch.pass) continue;
                if (!bestFit || an.overallScore > bestFit.score) {
                  bestFit = { name: per.name, score: an.overallScore, strategy: per.strategy };
                }
              }
            }
            return (
              <Card key={p.id} className="overflow-hidden p-0">
                <div className="flex items-stretch gap-4">
                  <div className="flex items-start p-3">
                    <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSel(p.id)} />
                  </div>
                  <div className="hidden h-32 w-44 shrink-0 bg-muted sm:block">
                    {hero ? (
                      <img src={hero} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground"><Home className="h-8 w-8" /></div>
                    )}
                  </div>
                  <div className="flex flex-1 items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/properties/$id" params={{ id: p.id }} className="font-semibold hover:underline">
                        {p.address}
                      </Link>
                      {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
                      {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
                      {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
                      {bestFit ? (
                        <Badge className="bg-accent text-accent-foreground" title={`Best fit: ${bestFit.name} (${bestFit.score}/100)`}>
                          ◆ {bestFit.name}
                        </Badge>
                      ) : personas.length > 0 ? (
                        <Badge variant="outline" className="text-amber-700">No persona fit</Badge>
                      ) : null}
                      {p.source_link && (
                        <a href={p.source_link} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                          <ExternalLink className="inline h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {a?.riskFlags?.length ? <div className="mt-2"><RiskChips flags={a.riskFlags as any} /></div> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span>Asking {fmtGBP(p.asking_price_gbp)}</span>
                      {a && <span>Best: <span className="font-medium text-foreground">{best?.name}</span> · {best?.dealScore}/100</span>}
                      {a && !a.personaMatch.pass && <span className="text-amber-700">Persona mismatch</span>}
                      {p.article4_status === "inside" && <Badge variant="outline" className="border-amber-400 text-amber-800">Article 4</Badge>}
                    </div>
                    {a && best && <p className="mt-1 text-xs text-muted-foreground">{best.summary}</p>}
                    {a && (
                      <div className="mt-3">
                        <RiskExplainer flags={a.riskFlags as any} score={a.overallScore} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {a && (
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${a.overallScore >= 60 ? "text-primary" : a.overallScore >= 40 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {a.overallScore}
                        </div>
                        <div className="text-xs text-muted-foreground">deal score</div>
                      </div>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => delMut.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}