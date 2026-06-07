import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateDefaultPersona, updateDefaultPersona } from "@/lib/personas.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/persona")({
  head: () => ({ meta: [{ title: "Persona — Deal Sourcer" }] }),
  component: PersonaPage,
});

const FIELDS: { key: string; label: string; suffix?: string; step?: number; transform?: "pct" }[] = [
  { key: "cash_available_gbp", label: "Cash available (£)", step: 1000 },
  { key: "target_rent_gbp", label: "Target monthly rent (£)", step: 25 },
  { key: "target_offer_gbp", label: "Target offer (£)", step: 1000 },
  { key: "max_offer_gbp", label: "Max offer (£)", step: 1000 },
  { key: "mortgage_rate", label: "Mortgage rate (%)", step: 0.05, transform: "pct" },
  { key: "stress_rate", label: "Stress rate (%)", step: 0.05, transform: "pct" },
  { key: "ltv", label: "LTV (%)", step: 1, transform: "pct" },
  { key: "refurb_buffer_gbp", label: "Refurb buffer (£)", step: 500 },
];

function PersonaPage() {
  const qc = useQueryClient();
  const get = useServerFn(getOrCreateDefaultPersona);
  const update = useServerFn(updateDefaultPersona);
  const q = useQuery({ queryKey: ["persona-default"], queryFn: () => get({ data: {} } as any) });
  const [form, setForm] = useState<Record<string, number>>({});

  useEffect(() => {
    if (q.data) {
      const f: Record<string, number> = {};
      FIELDS.forEach((field) => {
        const v = (q.data as any)[field.key];
        f[field.key] = field.transform === "pct" ? Math.round(v * 10000) / 100 : v;
      });
      setForm(f);
    }
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () => {
      const payload: any = {};
      FIELDS.forEach((field) => {
        payload[field.key] = field.transform === "pct" ? form[field.key] / 100 : form[field.key];
      });
      return update({ data: payload });
    },
    onSuccess: () => { toast.success("Persona saved"); qc.invalidateQueries({ queryKey: ["persona-default"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AppShell title="Investor persona">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>BTL Investor — default profile</CardTitle>
          <CardDescription>These criteria drive persona-match warnings and the default slider values on every property analysis.</CardDescription>
        </CardHeader>
        <CardContent>
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
          <div className="mt-6 flex items-center gap-3">
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save persona"}</Button>
            <p className="text-xs text-muted-foreground">
              Hard-coded criteria: 3–4 bed, EPC C (D/E allowed if neighbours C), parking + gas boiler required, ignore Victorian/Edwardian. (Editor coming in v2.)
            </p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}