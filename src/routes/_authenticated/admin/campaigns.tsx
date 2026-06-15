import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import {
  listCampaigns,
  createCampaign,
  deleteCampaign,
  sendCampaign,
} from "@/lib/campaigns.functions";
import { listUsersWithStats } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Send, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/campaigns")({
  head: () => ({ meta: [{ title: "Admin — Campaigns" }] }),
  component: AdminCampaignsPage,
});

type AudienceType = "all" | "inactive" | "specific";
type Channel = "toast" | "email" | "login_modal";

function AdminCampaignsPage() {
  const qc = useQueryClient();
  const getCampaigns = useServerFn(listCampaigns);
  const getUsers = useServerFn(listUsersWithStats);
  const createMut = useServerFn(createCampaign);
  const deleteMut = useServerFn(deleteCampaign);
  const sendMut = useServerFn(sendCampaign);

  const campaignsQ = useQuery({ queryKey: ["admin", "campaigns"], queryFn: () => getCampaigns() });
  const usersQ = useQuery({ queryKey: ["admin", "users"], queryFn: () => getUsers() });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [inactiveHours, setInactiveHours] = useState("72");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [channels, setChannels] = useState<Set<Channel>>(new Set(["toast"]));

  const create = useMutation({
    mutationFn: () =>
      createMut({
        data: {
          title,
          body,
          audienceType,
          inactiveHours: audienceType === "inactive" ? Number(inactiveHours) : undefined,
          userIds: audienceType === "specific" ? Array.from(selectedUsers) : undefined,
          channels: Array.from(channels),
        },
      }),
    onSuccess: () => {
      toast.success("Campaign created");
      setTitle("");
      setBody("");
      setSelectedUsers(new Set());
      qc.invalidateQueries({ queryKey: ["admin", "campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't create campaign"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMut({ data: { id } }),
    onSuccess: () => {
      toast.success("Campaign deleted");
      qc.invalidateQueries({ queryKey: ["admin", "campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (id: string) => sendMut({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`Sent to ${res.sent} recipient${res.sent === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["admin", "campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't send campaign"),
  });

  const toggleChannel = (c: Channel) => {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const campaigns = campaignsQ.data ?? [];
  const users = usersQ.data ?? [];

  return (
    <AppShell title="Admin — Campaigns">
      <AdminTabs active="campaigns" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">New campaign</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-title">Title</Label>
            <Input id="campaign-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-body">Message</Label>
            <Textarea
              id="campaign-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{name}}, you have {{properties}} properties in your pipeline…"
            />
            <p className="text-xs text-muted-foreground">
              Use <code>{"{{name}}"}</code> and <code>{"{{properties}}"}</code> to personalise.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Audience</Label>
            <RadioGroup value={audienceType} onValueChange={(v) => setAudienceType(v as AudienceType)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="audience-all" />
                <Label htmlFor="audience-all" className="font-normal">All users</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="inactive" id="audience-inactive" />
                <Label htmlFor="audience-inactive" className="font-normal">
                  Inactive for at least
                </Label>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={inactiveHours}
                  onChange={(e) => setInactiveHours(e.target.value)}
                  disabled={audienceType !== "inactive"}
                />
                <span className="text-sm text-muted-foreground">hours</span>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="specific" id="audience-specific" />
                <Label htmlFor="audience-specific" className="font-normal">Specific users</Label>
              </div>
            </RadioGroup>
            {audienceType === "specific" && (
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {users.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                    <Checkbox checked={selectedUsers.has(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                    {u.email} {u.display_name ? `(${u.display_name})` : ""}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-4">
              {(["toast", "email", "login_modal"] as Channel[]).map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={channels.has(c)} onCheckedChange={() => toggleChannel(c)} />
                  {c === "toast" ? "In-app toast (PWA)" : c === "email" ? "Email" : "Login notification"}
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !title || !body || channels.size === 0 || (audienceType === "specific" && selectedUsers.size === 0)}
          >
            Create campaign
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {campaigns.map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">{c.title}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={c.status === "sent" ? "secondary" : "outline"} className="capitalize">
                  {c.status}
                </Badge>
                {c.status === "sent" && (
                  <span className="text-xs text-muted-foreground">
                    {c.recipient_count} sent · {c.dismissed_count} dismissed
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Audience: {c.audience_type}
                {c.audience_type === "inactive" && ` (${c.inactive_hours}h)`}
                {c.audience_type === "specific" && ` (${c.user_ids?.length ?? 0} users)`}
                {" · Channels: "}
                {c.channels.join(", ")}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {c.status === "draft" && (
                  <Button size="sm" onClick={() => send.mutate(c.id)} disabled={send.isPending}>
                    <Send className="mr-2 h-4 w-4" /> Send now
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(c.id)} title="Delete campaign">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!campaigns.length && !campaignsQ.isLoading && (
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
        )}
      </div>
    </AppShell>
  );
}
