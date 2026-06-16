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
import { PropertyGridCard, type PropertyCardData } from "@/components/PropertyCard";
import { circumstanceFlexPct } from "@/lib/seller-context";
import { fmtGBP } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Trash2, ExternalLink, Home, Download, Filter as FilterIcon, PlusCircle,
  ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown,
  ArrowDownWideNarrow, ArrowUpNarrowWide, SlidersHorizontal,
  LayoutList, LayoutGrid, Map, Check,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { lazy, Suspense, useMemo, useState } from "react";
import { BatchAIDialog } from "@/components/BatchAIDialog";
import { AddPropertyDialog } from "@/components/AddPropertyDialog";
import { rowsToCSV, downloadCSV, type ExportRow } from "@/lib/export";
import { bestOfSelected, useStrategyFilter } from "@/lib/strategy-filter";
import { toast } from "sonner";

const PropertiesMap = lazy(() =>
  import("@/components/PropertiesMap").then((m) => ({ default: m.PropertiesMap })),
);

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({ meta: [{ title: "Properties — Deal Negotiator" }] }),
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery({ queryKey: ["properties"], queryFn: () => (listProperties as any)(), staleTime: 30 * 1000 });
    void context.queryClient.prefetchQuery({ queryKey: ["personas"], queryFn: () => (listPersonas as any)(), staleTime: 5 * 60 * 1000 });
  },
  component: PropertiesPage,
});

const STRATEGY_FILTERS = [
  { key: "BTL", label: "Buy-to-Let" },
  { key: "BRRR", label: "Buy-Refurb-Refinance-Rent" },
  { key: "SA", label: "Serviced Accommodation" },
  { key: "HMO", label: "HMO" },
  { key: "FLIP", label: "Flip" },
  { key: "TITLE_SPLIT", label: "Title Split" },
] as const;
type StrategyFilterKey = typeof STRATEGY_FILTERS[number]["key"];

type ViewMode = "list" | "cards" | "map";

function getInitialView(): ViewMode {
  if (typeof window === "undefined") return "cards";
  const saved = localStorage.getItem("pipeline_view") as ViewMode | null;
  return saved ?? "cards";
}

function article4Bucket(status: string | null | undefined): "inside" | "outside" | "partial" | "unknown" {
  const s = (status || "").toLowerCase();
  if (!s) return "unknown";
  if (s === "partial") return "partial";
  if (s === "inside" || s === "in" || s === "yes" || s === "true") return "inside";
  if (s === "outside" || s === "out" || s === "no" || s === "false") return "outside";
  return "unknown";
}

function PropertiesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listProperties);
  const personasFn = useServerFn(listPersonas);
  const del = useServerFn(deleteProperty);
  const { selected: lensSelected } = useStrategyFilter();
  const props = useQuery({ queryKey: ["properties"], queryFn: () => list() });
  const personasQ = useQuery({ queryKey: ["personas"], queryFn: () => personasFn({ data: {} } as any) });
  const personas = useMemo(() => (personasQ.data ?? []) as any[], [personasQ.data]);
  const activePersona = personas.find((p) => p.is_default) ?? personas[0];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialView);

  const switchView = (v: ViewMode) => {
    setViewMode(v);
    localStorage.setItem("pipeline_view", v);
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [sortBy, setSortBy] = useState<"score" | "yield" | "price_asc" | "price_desc" | "risk">("score");
  const [minScore, setMinScore] = useState(0);
  const ALL_FLAGS = ["shared_ownership","auction","developer_invitation","land_only","planning_only","fake_or_underpriced","listed_building","retirement_only","leasehold_short"] as const;
  type FlagKey = typeof ALL_FLAGS[number];
  const [hiddenFlags, setHiddenFlags] = useState<Set<FlagKey>>(new Set());

  const [search, setSearch] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [bedsMin, setBedsMin] = useState("");
  const [bedsMax, setBedsMax] = useState("");
  const [propertyTypes, setPropertyTypes] = useState<Set<string>>(new Set());
  const [article4Filter, setArticle4Filter] = useState<"any" | "inside" | "outside" | "partial" | "unknown">("any");
  const [strategyFilter, setStrategyFilter] = useState<Set<StrategyFilterKey>>(new Set());
  const [personaFitOnly, setPersonaFitOnly] = useState(false);

  const activeFilterCount =
    (search.trim() ? 1 : 0) + (priceMin || priceMax ? 1 : 0) +
    (bedsMin || bedsMax ? 1 : 0) + propertyTypes.size +
    (article4Filter !== "any" ? 1 : 0) + strategyFilter.size +
    (personaFitOnly ? 1 : 0) + (minScore > 0 ? 1 : 0) + hiddenFlags.size;

  const resetFilters = () => {
    setSearch(""); setPriceMin(""); setPriceMax(""); setBedsMin(""); setBedsMax("");
    setPropertyTypes(new Set()); setArticle4Filter("any"); setStrategyFilter(new Set());
    setPersonaFitOnly(false); setMinScore(0); setHiddenFlags(new Set());
  };

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["properties"] }); },
  });

  const allRows = useMemo(() => {
    const data = (props.data ?? []) as any[];
    return data.map((p) => {
      const a = activePersona ? analyseProperty(p, activePersona as any) : null;
      const sev = maxRiskSeverity(a?.riskFlags as any);
      let bestFit: { name: string; score: number; strategy: string } | null = null;
      for (const per of personas) {
        const an = analyseProperty(p, per as any);
        if (!an.personaMatch.pass) continue;
        if (!bestFit || an.overallScore > bestFit.score) {
          bestFit = { name: per.name, score: an.overallScore, strategy: per.strategy };
        }
      }
      const best = a ? bestOfSelected(a.strategies, lensSelected) : null;
      return { p, a, sev, bestFit, best };
    });
  }, [props.data, activePersona, personas, lensSelected]);

  const analysedCount = useMemo(
    () => allRows.filter((r) => (r.p as any).ai_payload || (r.p as any).analyses?.ai_payload).length,
    [allRows],
  );

  const availablePropertyTypes = useMemo(() => {
    const set = new Set<string>();
    for (const { p } of allRows) if ((p as any).property_type) set.add((p as any).property_type);
    return Array.from(set).sort();
  }, [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pMin = priceMin ? Number(priceMin) : null;
    const pMax = priceMax ? Number(priceMax) : null;
    const bMin = bedsMin ? Number(bedsMin) : null;
    const bMax = bedsMax ? Number(bedsMax) : null;
    const filtered = allRows.filter((r) => {
      const p = r.p as any;
      const flags = (r.a?.riskFlags ?? []) as any[];
      if (flags.some((f) => hiddenFlags.has(f.key))) return false;
      if ((r.a?.overallScore ?? 0) < minScore) return false;
      if (q && !`${p.address ?? ""} ${p.postcode ?? ""}`.toLowerCase().includes(q)) return false;
      if (pMin != null && (p.asking_price_gbp ?? 0) < pMin) return false;
      if (pMax != null && (p.asking_price_gbp ?? Infinity) > pMax) return false;
      if (bMin != null && (p.beds ?? 0) < bMin) return false;
      if (bMax != null && (p.beds ?? Infinity) > bMax) return false;
      if (propertyTypes.size && !propertyTypes.has(p.property_type ?? "")) return false;
      if (article4Filter !== "any" && article4Bucket(p.article4_status) !== article4Filter) return false;
      if (strategyFilter.size && !(r.a && strategyFilter.has(r.a.bestStrategy as StrategyFilterKey))) return false;
      if (personaFitOnly && !r.bestFit) return false;
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
      return (y.a?.overallScore ?? 0) - (x.a?.overallScore ?? 0);
    });
  }, [allRows, hiddenFlags, minScore, sortBy, search, priceMin, priceMax, bedsMin, bedsMax, propertyTypes, article4Filter, strategyFilter, personaFitOnly]);

  const cardRows = useMemo(
    (): PropertyCardData[] => rows.map(({ p, a, bestFit, best }) => ({ p, a, bestFit, best: best ?? null })),
    [rows],
  );

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
      const bestS = a?.strategies.find((s: any) => s.key === a.bestStrategy);
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
        best_strategy: bestS?.name ?? "",
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
    return source.map(({ p, a, sev, best }) => {
      const eff = a?.effectiveInputs;
      const rent = (p as any).estimated_rent_pcm ?? eff?.monthly_rent ?? null;
      const gy = rent && p.asking_price_gbp ? (rent * 12) / p.asking_price_gbp * 100 : null;
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
      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* View · Sort · Export — single compact group */}
        <div className="flex items-center rounded-md border p-0.5">
          {(["list", "cards", "map"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              className={`flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                viewMode === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "list" && <LayoutList className="h-3.5 w-3.5" />}
              {v === "cards" && <LayoutGrid className="h-3.5 w-3.5" />}
              {v === "map" && <Map className="h-3.5 w-3.5" />}
              {v}
            </button>
          ))}

          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />

          {/* Sort picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                {sortBy === "price_asc" ? (
                  <ArrowUpNarrowWide className="h-3.5 w-3.5" />
                ) : sortBy === "risk" ? (
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                )}
                Sort
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {([
                { value: "score",      label: "Deal score",      Icon: ArrowDownWideNarrow },
                { value: "yield",      label: "Gross yield",     Icon: ArrowDownWideNarrow },
                { value: "price_asc",  label: "Price low→high",  Icon: ArrowUpNarrowWide   },
                { value: "price_desc", label: "Price high→low",  Icon: ArrowDownWideNarrow },
                { value: "risk",       label: "Risk (clean first)", Icon: SlidersHorizontal },
              ] as const).map(({ value, label, Icon }) => (
                <DropdownMenuItem key={value} onClick={() => setSortBy(value as any)} className="gap-2 text-xs">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {sortBy === value && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />

          {/* Export */}
          <button
            onClick={exportCSV}
            disabled={!rows.length}
            title={selected.size > 0 ? `Export ${selected.size} selected` : `Export ${rows.length} properties`}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search address or postcode…"
          className="h-11 w-full sm:h-9 sm:w-[220px]"
        />

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-11 w-full sm:h-9 sm:w-auto">
              <FilterIcon className="mr-2 h-4 w-4" /> Filters {activeFilterCount > 0 && <Badge variant="secondary" className="ml-2">{activeFilterCount}</Badge>}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[380px] overflow-y-auto sm:w-[420px]">
            <SheetHeader><SheetTitle>Refine properties</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-5 pb-8">
              <div>
                <Label className="text-xs">Minimum deal score: {minScore}</Label>
                <Slider value={[minScore]} onValueChange={(v) => setMinScore(v[0])} min={0} max={100} step={5} className="mt-2" />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asking price</p>
                <div className="flex items-center gap-2">
                  <Input type="number" inputMode="numeric" placeholder="Min £" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="h-8" />
                  <span className="text-muted-foreground">–</span>
                  <Input type="number" inputMode="numeric" placeholder="Max £" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="h-8" />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bedrooms</p>
                <div className="flex items-center gap-2">
                  <Input type="number" inputMode="numeric" placeholder="Min" value={bedsMin} onChange={(e) => setBedsMin(e.target.value)} className="h-8" />
                  <span className="text-muted-foreground">–</span>
                  <Input type="number" inputMode="numeric" placeholder="Max" value={bedsMax} onChange={(e) => setBedsMax(e.target.value)} className="h-8" />
                </div>
              </div>
              {availablePropertyTypes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Property type</p>
                  {availablePropertyTypes.map((t) => (
                    <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox checked={propertyTypes.has(t)} onCheckedChange={(b) => setPropertyTypes((s) => { const n = new Set(s); b ? n.add(t) : n.delete(t); return n; })} />
                      {t}
                    </label>
                  ))}
                </div>
              )}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Article 4 status</p>
                <Select value={article4Filter} onValueChange={(v) => setArticle4Filter(v as any)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="outside">Outside (HMO permitted)</SelectItem>
                    <SelectItem value="inside">Inside (HMO restricted)</SelectItem>
                    <SelectItem value="partial">Partial — verify street</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best strategy</p>
                {STRATEGY_FILTERS.map((s) => (
                  <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={strategyFilter.has(s.key)} onCheckedChange={(b) => setStrategyFilter((set) => { const n = new Set(set); b ? n.add(s.key) : n.delete(s.key); return n; })} />
                    {s.label}
                  </label>
                ))}
              </div>
              {personas.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={personaFitOnly} onCheckedChange={(b) => setPersonaFitOnly(!!b)} />
                  Only properties that fit at least one criteria profile
                </label>
              )}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hide listings flagged as</p>
                {ALL_FLAGS.map((f) => (
                  <label key={f} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={hiddenFlags.has(f)} onCheckedChange={(b) => setHiddenFlags((s) => { const n = new Set(s); b ? n.add(f) : n.delete(f); return n; })} />
                    {f.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="w-full" onClick={resetFilters} disabled={activeFilterCount === 0}>
                Reset all filters
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {viewMode === "list" && (
          <Button
            variant="outline"
            size="sm"
            className="h-11 w-full sm:h-9 sm:w-auto"
            disabled={!rows.length}
            onClick={() => setCollapsed((s) => s.size === rows.length ? new Set() : new Set(rows.map((r) => r.p.id)))}
          >
            {collapsed.size === rows.length && rows.length > 0 ? (
              <><ChevronsUpDown className="mr-2 h-4 w-4" /> Expand all</>
            ) : (
              <><ChevronsDownUp className="mr-2 h-4 w-4" /> Collapse all</>
            )}
          </Button>
        )}

        <div className="hidden flex-1 sm:block" />

        {viewMode !== "map" && selected.size > 0 && (
          <span className="text-center text-sm text-muted-foreground sm:text-left">
            {selected.size} selected · <button className="underline" onClick={clearSel}>clear</button>
          </span>
        )}

        <AddPropertyDialog trigger={<Button size="sm" className="w-full sm:w-auto"><PlusCircle className="mr-2 h-4 w-4" />Add property</Button>} />
        <BatchAIDialog
          totalProperties={allRows.length}
          alreadyAnalysed={analysedCount}
          onDone={() => qc.invalidateQueries({ queryKey: ["properties"] })}
        />
      </div>

      {/* ── Select all (list / cards) ── */}
      {viewMode !== "map" && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={selected.size === rows.length && rows.length > 0}
            onCheckedChange={(b) => b ? selectAll() : clearSel()}
          />
          Select all ({rows.length})
        </div>
      )}

      {/* ── Comparison table ── */}
      {viewMode !== "map" && comparisonRows.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deal comparison · {comparisonRows.length} selected</p>
          <DealComparisonTable rows={comparisonRows} />
        </div>
      )}

      {/* ── Empty state ── */}
      {!props.data?.length ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
          <p>No properties yet.</p>
          <AddPropertyDialog trigger={<Button size="sm"><PlusCircle className="mr-2 h-4 w-4" />Add property</Button>} />
        </Card>
      ) : viewMode === "map" ? (
        /* ── Map view ── */
        <Suspense fallback={<div className="flex items-center justify-center rounded-xl border py-24 text-sm text-muted-foreground">Loading map…</div>}>
          <PropertiesMap rows={cardRows} />
        </Suspense>
      ) : viewMode === "cards" ? (
        /* ── Cards grid ── */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map(({ p, a, bestFit, best }) => (
            <PropertyGridCard
              key={p.id}
              data={{ p, a, bestFit, best: best ?? null }}
              selected={selected.has(p.id)}
              onSelect={() => toggleSel(p.id)}
            />
          ))}
        </div>
      ) : (
        /* ── List view ── */
        <div className="grid gap-4">
          {rows.map(({ p, a, bestFit, best }) => {
            const hero = (p.image_urls?.[0]) ?? null;
            const isCollapsed = collapsed.has(p.id);
            return (
              <Card key={p.id} className="overflow-hidden p-0">
                <div className="flex items-stretch gap-4">
                  <div className="flex items-start p-3">
                    <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSel(p.id)} />
                  </div>
                  {!isCollapsed && (
                    <div className="hidden h-24 w-28 shrink-0 bg-muted sm:block">
                      {hero ? (
                        <img src={hero} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground"><Home className="h-6 w-6" /></div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
                          <Badge variant="outline" className="text-amber-700">No criteria fit</Badge>
                        ) : null}
                        {p.source_link && (
                          <a href={p.source_link} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                            <ExternalLink className="inline h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {!isCollapsed && a?.riskFlags?.length ? <div className="mt-2"><RiskChips flags={a.riskFlags as any} /></div> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span>Asking {fmtGBP(p.asking_price_gbp)}</span>
                        {a && (best
                          ? <span>Best: <span className="font-medium text-foreground">{best.name}</span> · {best.dealScore}/100</span>
                          : <span className="text-amber-700">No selected strategy fits</span>)}
                        {a && !a.personaMatch.pass && <span className="text-amber-700">Criteria mismatch</span>}
                        {p.article4_status === "inside" && <Badge variant="outline" className="border-amber-400 text-amber-800">Article 4</Badge>}
                      </div>
                      {!isCollapsed && a && best && <p className="mt-1 text-xs text-muted-foreground">{best.summary}</p>}
                      {!isCollapsed && a && (
                        <div className="mt-3">
                          <RiskExplainer flags={a.riskFlags as any} score={a.overallScore} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      {a && (
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${a.overallScore >= 60 ? "text-primary" : a.overallScore >= 40 ? "text-amber-600" : "text-muted-foreground"}`}>
                            {a.overallScore}
                          </div>
                          <div className="text-xs text-muted-foreground">deal score</div>
                        </div>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => toggleCollapsed(p.id)} title={isCollapsed ? "Expand" : "Collapse"}>
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
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
