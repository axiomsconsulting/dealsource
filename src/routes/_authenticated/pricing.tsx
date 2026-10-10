import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Check } from "lucide-react";
import { PLANS, PRICES, TRIAL_DAYS, type PaidPlan, type Interval } from "@/lib/billing/plans";
import { recommendPlan } from "@/lib/billing/calculator";
import { createCheckoutSession } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Deal Source" },
      { name: "description", content: "Plans for UK property deal sourcing: Starter, Investor and Pro." },
      { property: "og:title", content: "Pricing — Deal Source" },
      { property: "og:description", content: "Plans for UK property deal sourcing: Starter, Investor and Pro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

const ORDER: PaidPlan[] = ["starter", "investor", "pro"];
const gbp = (p: number) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;

function PricingPage() {
  const checkout = useServerFn(createCheckoutSession);
  const [interval, setInterval] = useState<Interval>("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [props, setProps] = useState(40);
  const [ai, setAi] = useState(60);
  const [bulk, setBulk] = useState(true);
  const rec = recommendPlan({ properties: props, aiPerMonth: ai, features: { bulkAI: bulk } });

  async function buy(plan: PaidPlan) {
    setBusy(plan);
    try {
      const r = await checkout({ data: { plan, interval } });
      if (r.url) window.location.href = r.url;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start checkout");
      setBusy(null);
    }
  }

  return (
    <AppShell title="Pricing">
      <div className="mb-6 flex items-center gap-3">
        <span className={interval === "month" ? "font-semibold" : "text-muted-foreground"}>Monthly</span>
        <Switch checked={interval === "year"} onCheckedChange={(v) => setInterval(v ? "year" : "month")} />
        <span className={interval === "year" ? "font-semibold" : "text-muted-foreground"}>Yearly (2 months free)</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {ORDER.map((k) => {
          const p = PLANS[k];
          return (
            <Card key={k} className={rec.plan === k ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle>{p.label}</CardTitle>
                <p className="text-2xl font-bold">
                  {gbp(PRICES[k][interval])}
                  <span className="text-sm font-normal text-muted-foreground">/{interval}</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Feat>{p.maxProperties} active properties</Feat>
                <Feat>{p.aiPerPeriod} AI credits / month</Feat>
                <Feat>{p.maxPersonas} investor profiles</Feat>
                <Feat>{p.seats} seat{p.seats > 1 ? "s" : ""}</Feat>
                {p.features.photoRefurbAI && <Feat>Photo refurb AI</Feat>}
                {p.features.bulkAI && <Feat>Bulk AI analysis</Feat>}
                {p.features.privacyPdf && <Feat>Privacy-controlled PDFs</Feat>}
                {p.features.whiteLabel && <Feat>White-label deal sheets</Feat>}
                <Button className="mt-3 w-full" disabled={busy !== null} onClick={() => buy(k)}>
                  {busy === k && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Choose {p.label}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Prices include VAT. New accounts get a {TRIAL_DAYS}-day free trial.</p>

      <Card className="mt-8">
        <CardHeader><CardTitle>Which plan do I need?</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div><Label>Properties at once</Label><Input type="number" value={props} onChange={(e) => setProps(+e.target.value || 0)} /></div>
          <div><Label>AI analyses / month</Label><Input type="number" value={ai} onChange={(e) => setAi(+e.target.value || 0)} /></div>
          <div className="flex items-end gap-2"><Switch checked={bulk} onCheckedChange={setBulk} /><Label>Bulk AI</Label></div>
          <div className="text-sm">
            <p>Best fit: <b>{PLANS[rec.plan].label}</b></p>
            <p>{gbp(rec.monthlyPence)}/month{rec.topups > 0 && ` incl. ${rec.topups} top-up(s)`}</p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Feat({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />{children}</div>;
}
