import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { listFeedback } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  head: () => ({ meta: [{ title: "Admin — Feedback" }] }),
  component: AdminFeedbackPage,
});

type FeedbackRow = Tables<"feedback"> & {
  properties: { address: string | null; postcode: string | null } | null;
  profiles: { email: string | null; display_name: string | null } | null;
};

function AdminFeedbackPage() {
  const getFeedback = useServerFn(listFeedback);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "feedback"],
    queryFn: () => getFeedback(),
  });
  const rows = useMemo(() => (data ?? []) as FeedbackRow[], [data]);

  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"none" | "property" | "section">("none");

  const properties = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.property_id) map.set(r.property_id, r.properties?.address ?? r.property_id);
    }
    return Array.from(map.entries());
  }, [rows]);

  const sections = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.section_key, r.section_label);
    return Array.from(map.entries());
  }, [rows]);

  const filtered = rows.filter(
    (r) =>
      (propertyFilter === "all" || r.property_id === propertyFilter) &&
      (sectionFilter === "all" || r.section_key === sectionFilter),
  );

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: null, rows: filtered }];
    const map = new Map<string, { label: string; rows: typeof filtered }>();
    for (const r of filtered) {
      const key = groupBy === "property" ? (r.property_id ?? "none") : r.section_key;
      const label =
        groupBy === "property" ? (r.properties?.address ?? "No property") : r.section_label;
      if (!map.has(key)) map.set(key, { label, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, label: v.label, rows: v.rows }));
  }, [filtered, groupBy]);

  return (
    <AppShell title="Admin — Feedback">
      <AdminTabs active="feedback" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter by property" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {properties.map(([id, address]) => (
              <SelectItem key={id} value={id}>
                {address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter by section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sections.map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            <SelectItem value="property">Group by property</SelectItem>
            <SelectItem value="section">Group by section</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-sm text-muted-foreground">
          {filtered.length} of {rows.length} submissions
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.key}>
            {g.label != null && (
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold">{g.label}</h3>
                <Badge variant="outline" className="gap-1 text-xs">
                  <ThumbsUp className="h-3 w-3" /> {g.rows.filter((r) => r.vote === "up").length}
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  <ThumbsDown className="h-3 w-3" />{" "}
                  {g.rows.filter((r) => r.vote === "down").length}
                </Badge>
              </div>
            )}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Vote</TableHead>
                    <TableHead>Reasons</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.property_id ? (
                          <Link
                            to="/properties/$id"
                            params={{ id: r.property_id }}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {r.properties?.address ?? r.property_id}{" "}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.section_label}</TableCell>
                      <TableCell>
                        {r.vote === "up" ? (
                          <ThumbsUp className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <ThumbsDown className="h-4 w-4 text-rose-600" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs text-xs">{r.reasons.join(", ")}</TableCell>
                      <TableCell className="max-w-xs text-xs">{r.note}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.profiles?.email ?? r.profiles?.display_name ?? r.user_id}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {[r.location_city, r.location_country].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.ip_address ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
