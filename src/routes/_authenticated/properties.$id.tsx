import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { getProperty, updateProperty } from "@/lib/ingest.functions";
import { getOrCreateDefaultPersona } from "@/lib/personas.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { analyseProperty } from "@/lib/analysis/engine";
import type { SliderOverrides, StrategyResult } from "@/lib/analysis/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SliderInput } from "@/components/SliderInput";
import { fmtGBP, fmtNum, fmtPct } from "@/lib/format";
import { ArrowLeft, ExternalLink, EyeOff, AlertTriangle, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: () => ({ meta: [{ title: "Property — Deal Sourcer" }] }),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getProp = useServerFn(getProperty);
  const getPersona = useServerFn(getOrCreateDefaultPersona);
  const update = useServerFn(updateProperty);

  const prop = useQuery({ queryKey: ["property", id], queryFn: () => getProp({ data: { id } }) });
  const persona = useQuery({ queryKey: ["persona-default"], queryFn: () => getPersona({ data: {} } as any) });

  const [over, setOver] = useState<SliderOverrides>({});

  const analysis = useMemo(() => {
    if (!prop.data || !persona.data) return null;
    return analyseProperty(prop.data as any, persona.data as any, over);
  }, [prop.data, persona.data, over]);

  const updateMut = useMutation({
    mutationFn: (patch: any) => update({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property", id] }),
  });

  if (prop.isLoading || persona.isLoading) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!prop.data || !persona.data || !analysis) return <AppShell><p>Not found</p></AppShell>;

  const p = prop.data as any;
  const per = persona.data as any;
  const eff = analysis.effectiveInputs;
  const best = analysis.strategies.find((s) => s.key === analysis.bestStrategy)!;

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link to="/properties" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All properties
          </Link>
          <h1 className="text-2xl font-bold">{p.hide_address ? "Property (address hidden)" : p.address}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {p.beds && <Badge variant="outline">{p.beds} bed</Badge>}
            {p.baths && <Badge variant="outline">{p.baths} bath</Badge>}
            {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
            {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
            {p.tenure && <Badge variant="outline">{p.tenure}</Badge>}
            {p.area_sqm && <Badge variant="outline">{Math.round(p.area_sqm)} m²</Badge>}
            <Badge>Asking {fmtGBP(p.asking_price_gbp)}</Badge>
            {p.source_link && (
              <a href={p.source_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> View listing
              </a>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-5xl font-bold text-primary">{analysis.overallScore}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Deal score</div>
          <div className="mt-2 flex items-center gap-2">
            <Label htmlFor="hide" className="text-xs"><EyeOff className="inline h-3 w-3" /> Redact</Label>
            <Switch
              id="hide"
              checked={p.hide_address}
              onCheckedChange={(v) => { updateMut.mutate({ hide_address: v }); toast.success(v ? "Address hidden" : "Address visible"); }}
            />
          </div>
        </div>
      </div>

      {!analysis.personaMatch.pass && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-medium text-amber-900">Persona mismatch</p>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                {analysis.personaMatch.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tune the deal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <SliderInput label="Offer price" value={Math.round(eff.offer_price)} onChange={(n) => setOver({ ...over, offer_price: n })} min={50000} max={500000} step={500} prefix="£" />
            <SliderInput label="Monthly rent" value={Math.round(eff.monthly_rent)} onChange={(n) => setOver({ ...over, monthly_rent: n })} min={400} max={5000} step={25} prefix="£" />
            <SliderInput label="Refurb cost" value={Math.round(eff.refurb_cost)} onChange={(n) => setOver({ ...over, refurb_cost: n })} min={0} max={100000} step={500} prefix="£" />
            <SliderInput label="ARV (after refurb)" value={Math.round(eff.arv)} onChange={(n) => setOver({ ...over, arv: n })} min={50000} max={600000} step={1000} prefix="£" />
            <SliderInput label="Mortgage rate" value={parseFloat((eff.mortgage_rate * 100).toFixed(2))} onChange={(n) => setOver({ ...over, mortgage_rate: n / 100 })} min={2} max={12} step={0.05} suffix="%" />
            <SliderInput label="LTV" value={Math.round(eff.ltv * 100)} onChange={(n) => setOver({ ...over, ltv: n / 100 })} min={50} max={85} step={1} suffix="%" />
            <div className="space-y-2 rounded-md bg-muted/50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HMO / SA tuning</p>
              <SliderInput label="HMO rooms" value={over.room_count ?? (p.beds ? p.beds + 1 : 4)} onChange={(n) => setOver({ ...over, room_count: n })} min={2} max={8} step={1} />
              <SliderInput label="HMO £/room" value={over.rent_per_room ?? 525} onChange={(n) => setOver({ ...over, rent_per_room: n })} min={300} max={900} step={5} prefix="£" />
              <SliderInput label="SA nightly" value={over.sa_nightly ?? 95} onChange={(n) => setOver({ ...over, sa_nightly: n })} min={50} max={300} step={5} prefix="£" />
              <SliderInput label="SA occupancy" value={Math.round((over.sa_occupancy ?? 0.65) * 100)} onChange={(n) => setOver({ ...over, sa_occupancy: n / 100 })} min={30} max={95} step={1} suffix="%" />
            </div>
            <Button variant="outline" className="w-full" onClick={() => setOver({})}>Reset to persona defaults</Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Best strategy: {best.name}</span>
                <Badge className="bg-primary">{best.dealScore}/100</Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{best.summary}</p>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Strategy comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={best.key}>
                <TabsList className="flex w-full flex-wrap">
                  {analysis.strategies.map((s) => (
                    <TabsTrigger key={s.key} value={s.key} className="flex-1">
                      {s.name} <span className="ml-1.5 text-xs opacity-60">{s.dealScore}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {analysis.strategies.map((s) => (
                  <TabsContent key={s.key} value={s.key} className="pt-4">
                    <StrategyView s={s} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-accent" /> Negotiation playbook</CardTitle>
              <p className="text-sm text-muted-foreground">Justified leverage points to take to the agent.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.negotiation.map((n, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{n.category.replace("_", " ")}</Badge>
                        <p className="font-medium">{n.title}</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{n.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary">−{fmtGBP(n.gbp_impact)}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">{n.confidence}</div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {p.pf_json && (
            <Card>
              <CardHeader><CardTitle className="text-base">Property Filter signals</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  {p.pf_json.propertyLight?.lastSold && (
                    <Stat label="Last sold" v={`${fmtGBP(p.pf_json.propertyLight.lastSold.value)} (${new Date(p.pf_json.propertyLight.lastSold.date).getFullYear()})`} />
                  )}
                  {p.pf_json.propertyLight?.equity != null && <Stat label="Seller equity" v={fmtPct(p.pf_json.propertyLight.equity)} />}
                  {p.pf_json.propertyLight?.article4Status && <Stat label="Article 4" v={p.pf_json.propertyLight.article4Status} />}
                  {p.pf_json.propertyLight?.councilTax && <Stat label="Council tax" v={p.pf_json.propertyLight.councilTax} />}
                  {p.pf_json.propertyLight?.multipleReduce != null && <Stat label="Reductions" v={String(p.pf_json.propertyLight.multipleReduce)} />}
                  {p.pf_json.propertyLight?.multipleBack != null && <Stat label="Back-on-market" v={String(p.pf_json.propertyLight.multipleBack)} />}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{v}</p>
    </div>
  );
}

function StrategyView({ s }: { s: StrategyResult }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {s.feasible
          ? <CheckCircle2 className="h-5 w-5 text-primary" />
          : <XCircle className="h-5 w-5 text-amber-600" />}
        <p className="text-sm">{s.summary}</p>
      </div>
      {s.reasons && s.reasons.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">Watch outs</p>
          <ul className="list-inside list-disc">
            {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {s.numbers.map((n, i) => (
          <div key={i} className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{n.label}</p>
            <p className="text-lg font-semibold">
              {n.format === "gbp" ? fmtGBP(n.value) :
               n.format === "pct" ? fmtPct(n.value) :
               n.format === "months" ? `${fmtNum(n.value)} mo` :
               fmtNum(n.value, 2)}
            </p>
            {n.hint && <p className="mt-1 text-[10px] text-muted-foreground">{n.hint}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}