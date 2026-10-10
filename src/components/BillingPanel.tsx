import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import { getBillingOverview, createPortalSession, createTopupCheckoutSession } from "@/lib/billing.functions";
import { PLANS, TOPUP_CREDITS, PRICES } from "@/lib/billing/plans";

export function BillingPanel() {
  const get = useServerFn(getBillingOverview);
  const portal = useServerFn(createPortalSession);
  const topup = useServerFn(createTopupCheckoutSession);
  const q = useQuery({ queryKey: ["billing"], queryFn: () => get() });
  const [busy, setBusy] = useState<string | null>(null);

  async function go(kind: "portal" | "topup") {
    setBusy(kind);
    try {
      const r = kind === "portal" ? await portal() : await topup();
      if (r.url) window.location.href = r.url;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open Stripe");
      setBusy(null);
    }
  }

  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Couldn't load billing.</p>;
  const e = q.data;
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {PLANS[e.plan]?.label ?? e.plan} <Badge variant="secondary">{e.status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {e.trialEndsAt && e.status === "trialing" && (
            <p>Trial ends {new Date(e.trialEndsAt).toLocaleDateString("en-GB")}</p>
          )}
          {e.periodEnd && (
            <p className="text-muted-foreground">
              {e.cancelAtPeriodEnd ? "Ends" : "Renews"} {new Date(e.periodEnd).toLocaleDateString("en-GB")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild><Link to="/pricing">Change plan</Link></Button>
            <Button variant="outline" disabled={busy !== null} onClick={() => go("portal")}>
              {busy === "portal" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Manage billing
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Usage this period</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="mb-1 flex justify-between"><span>Properties</span><span>{e.usage.properties} / {e.limits.maxProperties}</span></div>
            <Progress value={pct(e.usage.properties, e.limits.maxProperties)} />
          </div>
          <div>
            <div className="mb-1 flex justify-between"><span>AI credits</span><span>{e.usage.aiUsed} / {e.usage.aiLimit}</span></div>
            <Progress value={pct(e.usage.aiUsed, e.usage.aiLimit)} />
          </div>
          <p className="text-muted-foreground">Top-up credits left: {e.usage.topup}</p>
          <Button variant="secondary" disabled={busy !== null} onClick={() => go("topup")}>
            {busy === "topup" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Buy {TOPUP_CREDITS} AI credits — £{(PRICES.topup50 / 100).toFixed(2)}
          </Button>
          {!e.enforced && <p className="text-xs text-muted-foreground">Limits are not enforced yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
