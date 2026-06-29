import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import {
  getSearchIngestSettings,
  updateSearchIngestSettings,
} from "@/lib/search-ingest.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Admin — Settings" }] }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSearchIngestSettings);
  const updateFn = useServerFn(updateSearchIngestSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["search-ingest-settings"],
    queryFn: () => getFn(),
  });

  const [maxPerBatch, setMaxPerBatch] = useState(10);
  const [throttleMs, setThrottleMs] = useState(2500);
  const [allowAll, setAllowAll] = useState(false);

  useEffect(() => {
    if (data) {
      setMaxPerBatch(data.max_per_batch);
      setThrottleMs(data.throttle_ms);
      setAllowAll(data.allow_all);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({ data: { max_per_batch: maxPerBatch, throttle_ms: throttleMs, allow_all: allowAll } }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["search-ingest-settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AppShell>
      <AdminTabs active="settings" />
      <div className="space-y-4">
        <Card className="space-y-5 p-5">
          <div>
            <h2 className="text-base font-semibold">Search-URL ingest</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Controls how many properties any user can bulk-add from a Rightmove search URL in
              one go, and how long to wait between adds so Rightmove doesn't rate-limit Firecrawl.
              The search page itself uses zero Firecrawl credits — these limits matter when users
              follow up with deep enrichment per property.
            </p>
          </div>

          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="max-batch">Max properties per batch</Label>
                <Input
                  id="max-batch"
                  type="number"
                  min={1}
                  max={50}
                  value={maxPerBatch}
                  onChange={(e) => setMaxPerBatch(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  disabled={allowAll}
                />
                <p className="text-xs text-muted-foreground">1 means single-property mode. 5–10 is a safe default.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="throttle">Throttle between adds (ms)</Label>
                <Input
                  id="throttle"
                  type="number"
                  min={500}
                  max={15000}
                  step={250}
                  value={throttleMs}
                  onChange={(e) => setThrottleMs(Math.max(500, Math.min(15000, parseInt(e.target.value) || 500)))}
                />
                <p className="text-xs text-muted-foreground">
                  Rightmove tolerates ~1 request every 2–3s from a single client. 2500ms is the safe default.
                </p>
              </div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Allow “Add ALL” (no per-batch cap)</Label>
                  <p className="text-xs text-muted-foreground">
                    Only enable for trusted users — large batches can get Firecrawl rate-limited by Rightmove.
                  </p>
                </div>
                <Switch checked={allowAll} onCheckedChange={setAllowAll} />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save settings
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}