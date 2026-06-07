import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { listSavedSearches, createSavedSearch, updateSavedSearch, deleteSavedSearch, runSavedSearchPreview } from "@/lib/saved-searches.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useState } from "react";
import { Bell, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/searches")({
  head: () => ({ meta: [{ title: "Saved searches — Deal Sourcer" }] }),
  component: SearchesPage,
});

function SearchesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSavedSearches);
  const create = useServerFn(createSavedSearch);
  const update = useServerFn(updateSavedSearch);
  const del = useServerFn(deleteSavedSearch);
  const preview = useServerFn(runSavedSearchPreview);
  const searches = useQuery({ queryKey: ["searches"], queryFn: () => list() });

  const [form, setForm] = useState({
    name: "", postcode_prefix: "", city: "", min_beds: "3", max_beds: "",
    min_price: "", max_price: "200000", min_deal_score: "60",
    notify_email: "", frequency: "daily" as "daily" | "weekly" | "off",
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: {
      name: form.name,
      postcode_prefix: form.postcode_prefix || null,
      city: form.city || null,
      min_beds: form.min_beds ? parseInt(form.min_beds) : null,
      max_beds: form.max_beds ? parseInt(form.max_beds) : null,
      min_price: form.min_price ? parseFloat(form.min_price) : null,
      max_price: form.max_price ? parseFloat(form.max_price) : null,
      min_deal_score: parseInt(form.min_deal_score || "60"),
      notify_email: form.notify_email || null,
      frequency: form.frequency,
      is_active: true,
    } }),
    onSuccess: () => { toast.success("Search saved"); setForm({ ...form, name: "" }); qc.invalidateQueries({ queryKey: ["searches"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["searches"] }),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      update({ data: { id, patch: { is_active } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["searches"] }),
  });

  return (
    <AppShell title="Saved searches & alerts">
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create new search</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. NG7 3-beds under £180k" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Postcode prefix</Label><Input value={form.postcode_prefix} onChange={(e) => setForm({ ...form, postcode_prefix: e.target.value })} placeholder="NG7" /></div>
              <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>Min beds</Label><Input type="number" value={form.min_beds} onChange={(e) => setForm({ ...form, min_beds: e.target.value })} /></div>
              <div><Label>Max beds</Label><Input type="number" value={form.max_beds} onChange={(e) => setForm({ ...form, max_beds: e.target.value })} /></div>
              <div><Label>Min price</Label><Input type="number" value={form.min_price} onChange={(e) => setForm({ ...form, min_price: e.target.value })} /></div>
              <div><Label>Max price</Label><Input type="number" value={form.max_price} onChange={(e) => setForm({ ...form, max_price: e.target.value })} /></div>
            </div>
            <div><Label>Min deal score</Label><Input type="number" value={form.min_deal_score} onChange={(e) => setForm({ ...form, min_deal_score: e.target.value })} /></div>
            <div><Label>Notify email</Label><Input type="email" value={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.value })} placeholder="you@example.com" /></div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v: any) => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="off">Off (manual only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => createMut.mutate()} disabled={!form.name || createMut.isPending} className="w-full">
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save search
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {!searches.data?.length ? (
            <Card className="p-12 text-center text-muted-foreground">No saved searches yet.</Card>
          ) : searches.data.map((s: any) => (
            <SearchRow key={s.id} s={s} onPreview={(id) => preview({ data: { id } })}
              onToggle={(active) => toggleMut.mutate({ id: s.id, is_active: active })}
              onDelete={() => delMut.mutate(s.id)} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function SearchRow({ s, onPreview, onToggle, onDelete }: {
  s: any; onPreview: (id: string) => Promise<any[]>;
  onToggle: (active: boolean) => void; onDelete: () => void;
}) {
  const [matches, setMatches] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">{s.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[s.postcode_prefix, s.city, s.min_beds && `${s.min_beds}+ beds`,
                s.max_price && `<£${Math.round(s.max_price / 1000)}k`,
                `score ≥${s.min_deal_score}`, s.frequency].filter(Boolean).join(" · ")}
            </p>
            {s.notify_email && <p className="mt-1 text-xs"><Bell className="mr-1 inline h-3 w-3" />{s.notify_email}</p>}
            {s.last_run_at && <p className="mt-1 text-xs text-muted-foreground">Last run: {new Date(s.last_run_at).toLocaleString()}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={s.is_active} onCheckedChange={onToggle} />
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
              setBusy(true);
              try { setMatches(await onPreview(s.id)); }
              finally { setBusy(false); }
            }}>Preview</Button>
            <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        {matches && (
          <p className="mt-3 text-sm text-muted-foreground">Matched {matches.length} propert{matches.length === 1 ? "y" : "ies"} in your library.</p>
        )}
      </CardContent>
    </Card>
  );
}