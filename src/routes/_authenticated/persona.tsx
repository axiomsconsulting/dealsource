import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import {
  listPersonas, updateDefaultPersona, createPersona, deletePersona, setActivePersona,
} from "@/lib/personas.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { LENDER_CRITERIA, INVESTOR_TYPES, deriveLenderCriteria, type InvestorType } from "@/lib/analysis/lender-criteria";
import { fmtPct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/persona")({
  head: () => ({ meta: [{ title: "Personas — Deal Sourcer" }] }),
  component: PersonaPage,
});

const FIELDS: { key: string; label: string; suffix?: string; step?: number; transform?: "pct" }[] = [
  { key: "cash_available_gbp", label: "Cash available (£)", step: 1000 },
  { key: "target_rent_gbp", label: "Target monthly rent (£)", step: 25 },
  { key: "target_offer_gbp", label: "Target offer (£)", step: 1000 },
  { key: "max_offer_gbp", label: "Max offer (£)", step: 1000 },
  { key: "refurb_buffer_gbp", label: "Refurb buffer (£)", step: 500 },
  { key: "min_beds", label: "Min beds", step: 1 },
  { key: "max_beds", label: "Max beds", step: 1 },
];

const STRATEGIES = ["BTL", "BRRR", "SA", "HMO", "FLIP", "TITLE_SPLIT", "CUSTOM"] as const;

function PersonaPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPersonas);
  const update = useServerFn(updateDefaultPersona);
  const create = useServerFn(createPersona);
  const del = useServerFn(deletePersona);
  const setActive = useServerFn(setActivePersona);
  const q = useQuery({ queryKey: ["personas"], queryFn: () => list({ data: {} } as any) });
  const personas = (q.data ?? []) as any[];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => personas.find((p) => p.id === selectedId) ?? personas.find((p) => p.is_default) ?? personas[0], [personas, selectedId]);
  const [form, setForm] = useState<Record<string, number>>({});
  const [aiDefault, setAiDefault] = useState(false);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<string>("BTL");
  const [investorType, setInvestorType] = useState<InvestorType>("individual");
  const [newName, setNewName] = useState("");
  const [newStrategy, setNewStrategy] = useState<string>("BTL");

  useEffect(() => {
    if (selected) {
      const f: Record<string, number> = {};
      FIELDS.forEach((field) => {
        const v = (selected as any)[field.key];
        f[field.key] = field.transform === "pct" ? Math.round(v * 10000) / 100 : v;
      });
      setForm(f);
      setAiDefault(!!selected.ai_default_enabled);
      setName(selected.name);
      setStrategy(selected.strategy);
      setInvestorType((selected.investor_type as InvestorType) ?? "individual");
    }
  }, [selected?.id]);

  const mut = useMutation({
    mutationFn: () => {
      const payload: any = {};
      FIELDS.forEach((field) => {
        payload[field.key] = field.transform === "pct" ? form[field.key] / 100 : form[field.key];
      });
      payload.ai_default_enabled = aiDefault;
      payload.name = name;
      payload.strategy = strategy;
      payload.investor_type = investorType;
      payload.id = selected!.id;
      return update({ data: payload });
    },
    onSuccess: () => { toast.success("Persona saved"); qc.invalidateQueries({ queryKey: ["personas"] }); qc.invalidateQueries({ queryKey: ["persona-default"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: { name: newName, strategy: newStrategy as any, copyFromId: selected?.id } }),
    onSuccess: (row: any) => {
      toast.success("Persona created"); setNewName(""); setSelectedId(row.id);
      qc.invalidateQueries({ queryKey: ["personas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); setSelectedId(null); qc.invalidateQueries({ queryKey: ["personas"] }); qc.invalidateQueries({ queryKey: ["persona-default"] }); },
  });
  const activeMut = useMutation({
    mutationFn: (id: string) => setActive({ data: { id } }),
    onSuccess: () => { toast.success("Active persona updated"); qc.invalidateQueries({ queryKey: ["personas"] }); qc.invalidateQueries({ queryKey: ["persona-default"] }); qc.invalidateQueries({ queryKey: ["properties"] }); },
  });

  return (
    <AppShell title="Investor personas">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personas</CardTitle>
            <CardDescription>Switch active profile — the active one drives all analysis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {personas.map((p) => (
              <div key={p.id} className={`group flex items-center gap-2 rounded-md border p-2 ${selected?.id === p.id ? "border-primary bg-muted/50" : ""}`}>
                <button onClick={() => setSelectedId(p.id)} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.is_default && <Badge className="h-5 text-[10px]">active</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.strategy}</div>
                </button>
                {!p.is_default && (
                  <Button size="icon" variant="ghost" title="Set active" onClick={() => activeMut.mutate(p.id)}>
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" title="Delete" onClick={() => { if (confirm("Delete persona?")) delMut.mutate(p.id); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="mt-3 space-y-2 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">New persona</p>
              <Input placeholder="e.g. Sarah Johnson, or HMO £100k" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Select value={newStrategy} onValueChange={setNewStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="w-full" disabled={!newName || createMut.isPending} onClick={() => createMut.mutate()}>
                <Plus className="mr-1 h-4 w-4" /> Add persona{selected ? " (copy of selected)" : ""}
              </Button>
            </div>
          </CardContent>
        </Card>
        {selected && (
        <Card>
        <CardHeader>
          <CardTitle>Edit persona</CardTitle>
          <CardDescription>Criteria drive persona-match warnings and default slider values on every property analysis.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label>Persona name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Johnson — HMO" />
            </div>
            <div className="space-y-1.5">
              <Label>Primary strategy</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  type="number"
                  step={f.step}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: parseFloat(e.target.value) || 0 })}
                />
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-1.5">
            <Label>How does this investor borrow?</Label>
            <p className="text-xs text-muted-foreground">
              This is what actually changes a lender's appetite — the rate, max LTV and stress test they'll
              offer follow from the structure, not from a number you'd otherwise have to guess. The deal
              sheet still lets you tune the rate/LTV per-property if you know better terms are on the table.
            </p>
            <Select value={investorType} onValueChange={(v) => setInvestorType(v as InvestorType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVESTOR_TYPES.map((t) => <SelectItem key={t} value={t}>{LENDER_CRITERIA[t].label}</SelectItem>)}
              </SelectContent>
            </Select>
            {(() => {
              const c = deriveLenderCriteria(investorType);
              return (
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 font-medium">
                    <span>Typical rate: {fmtPct(c.mortgage_rate, 2)}</span>
                    <span>Max LTV: {fmtPct(c.ltv, 0)}</span>
                    <span>Stress test: {fmtPct(c.stress_rate, 2)}</span>
                  </div>
                  <p className="text-muted-foreground">{c.description}</p>
                </div>
              );
            })()}
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-md border bg-muted/30 p-4">
            <Switch checked={aiDefault} onCheckedChange={setAiDefault} id="ai-default" />
            <div className="flex-1">
              <Label htmlFor="ai-default" className="font-medium">Auto-run AI analysis on new properties</Label>
              <p className="text-xs text-muted-foreground">When on, the AI surveyor runs automatically each time a property is ingested (uses credits). Off by default — you can always run it manually per property.</p>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save persona"}</Button>
            {!selected.is_default && (
              <Button variant="outline" onClick={() => activeMut.mutate(selected.id)}>Make active</Button>
            )}
          </div>
        </CardContent>
        </Card>
        )}
      </div>
    </AppShell>
  );
}