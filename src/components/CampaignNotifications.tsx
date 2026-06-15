import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMyNotifications, dismissNotification } from "@/lib/campaigns.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SNOOZED_KEY = "campaign_snoozed_ids";

function getSnoozed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SNOOZED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function addSnoozed(id: string) {
  const snoozed = getSnoozed();
  snoozed.add(id);
  sessionStorage.setItem(SNOOZED_KEY, JSON.stringify(Array.from(snoozed)));
}

export function CampaignNotifications() {
  const qc = useQueryClient();
  const getNotifications = useServerFn(getMyNotifications);
  const dismissFn = useServerFn(dismissNotification);
  const [snoozed, setSnoozed] = useState<Set<string>>(() => getSnoozed());
  const [toasted, setToasted] = useState<Set<string>>(() => getSnoozed());

  const { data } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => getNotifications(),
    staleTime: 60 * 1000,
  });

  const dismissMut = useMutation({
    mutationFn: (campaignId: string) => dismissFn({ data: { campaignId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const notifications = data ?? [];

  const modalNotification = notifications.find(
    (n) => n.channels.includes("login_modal") && !snoozed.has(n.campaignId),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(display-mode: standalone)").matches) return;
    for (const n of notifications) {
      if (n.channels.includes("toast") && !toasted.has(n.campaignId)) {
        toast(n.title, { description: n.body });
        addSnoozed(n.campaignId);
        setToasted((prev) => new Set(prev).add(n.campaignId));
      }
    }
  }, [notifications, toasted]);

  if (!modalNotification) return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modalNotification.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{modalNotification.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              addSnoozed(modalNotification.campaignId);
              setSnoozed((prev) => new Set(prev).add(modalNotification.campaignId));
            }}
          >
            Remind me later
          </Button>
          <Button onClick={() => dismissMut.mutate(modalNotification.campaignId)}>
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
