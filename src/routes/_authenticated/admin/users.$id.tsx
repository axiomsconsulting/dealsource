import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ArrowLeft, UserCog } from "lucide-react";
import { getUserInsights, startImpersonation } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/users/$id")({
  head: () => ({ meta: [{ title: "Admin — User details" }] }),
  component: AdminUserDetailPage,
});

const AI_FEATURE_LABELS: Record<string, string> = {
  full_analysis: "Full AI analysis",
  refurb_photos: "Refurb photo analysis",
  viewing_issue_photos: "On-site issue photos",
  viewing_notes: "On-site notes analysis",
  hmo_layout: "HMO/SA layout analysis",
  listing_images: "Photo gallery organiser",
  seller_flex: "Seller flexibility estimate",
  nearby_listings: "Nearby listings search",
};

function AdminUserDetailPage() {
  const { id } = Route.useParams();
  const { role } = Route.useRouteContext();
  const router = useRouter();
  const isSuperAdmin = role === "super_admin";
  const [switching, setSwitching] = useState(false);

  const getInsights = useServerFn(getUserInsights);
  const startImpersonationFn = useServerFn(startImpersonation);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "user-insights", id],
    queryFn: () => getInsights({ data: { userId: id } }),
  });

  const impersonateMut = useMutation({
    mutationFn: async () => {
      const { tokenHash } = await startImpersonationFn({ data: { userId: id } });
      // Open in a brand-new tab — the storage shim in that tab isolates the
      // Supabase session to sessionStorage, so this admin tab (and any other
      // admin tabs) stays signed in as the admin. Multiple admins can each
      // impersonate independently this way.
      const w = window.open(`/impersonate-as/${tokenHash}`, "_blank", "noopener");
      if (!w) {
        toast.error("Pop-up blocked — allow pop-ups for this site to impersonate.");
      }
    },
    onMutate: () => setSwitching(true),
    onSuccess: () => setSwitching(false),
    onError: (e: Error) => {
      toast.error(e.message || "Couldn't switch to this user");
      setSwitching(false);
    },
  });

  if (isLoading) {
    return (
      <AppShell title="Admin — User details">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell title="Admin — User details">
        <p className="text-sm text-muted-foreground">User not found.</p>
      </AppShell>
    );
  }

  const { profile, properties, aiUsage, loginStats } = data;

  return (
    <AppShell title="Admin — User details">
      <Link to="/admin/users" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{profile.display_name || profile.email}</h2>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Joined {new Date(profile.created_at).toLocaleDateString()} ·{" "}
              <Badge variant="outline" className="capitalize">{profile.role.replace("_", " ")}</Badge>
            </p>
          </div>
          {isSuperAdmin && profile.role !== "super_admin" && (
            <Button onClick={() => impersonateMut.mutate()} disabled={switching}>
              <UserCog className="mr-2 h-4 w-4" />
              {switching ? "Opening…" : "View as this user (new tab)"}
            </Button>
          )}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Last 24h</p>
          <p className="text-2xl font-bold">{loginStats.last24h}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Last 7 days</p>
          <p className="text-2xl font-bold">{loginStats.last7d}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Last 30 days</p>
          <p className="text-2xl font-bold">{loginStats.last30d}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Last 90 days</p>
          <p className="text-2xl font-bold">{loginStats.last90d}</p>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <h3 className="mb-3 text-sm font-semibold">Login activity (last 90 days)</h3>
        <ChartContainer config={{ logins: { label: "Logins", color: "hsl(var(--primary))" } }} className="aspect-auto h-[200px] w-full">
          <BarChart data={loginStats.series}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={20}
              tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="logins" fill="var(--color-logins)" radius={2} />
          </BarChart>
        </ChartContainer>
      </Card>

      <Card className="mb-4 p-4">
        <h3 className="mb-3 text-sm font-semibold">AI feature usage</h3>
        {aiUsage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI features used yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-right">Calls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aiUsage.map((row) => (
                <TableRow key={row.feature_key}>
                  <TableCell>{AI_FEATURE_LABELS[row.feature_key] ?? row.feature_key}</TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Properties ({properties.length})</h3>
        {properties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No properties yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Asking price</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link to="/properties/$id" params={{ id: p.id }} className="hover:underline">
                      {p.address}
                    </Link>
                  </TableCell>
                  <TableCell>{p.postcode ?? "—"}</TableCell>
                  <TableCell>{p.asking_price_gbp ? `£${p.asking_price_gbp.toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </AppShell>
  );
}
