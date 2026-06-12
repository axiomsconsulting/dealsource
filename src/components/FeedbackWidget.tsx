import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { submitFeedback } from "@/lib/feedback.functions";
import { reasonsFor, type FeedbackVote } from "@/lib/feedback-reasons";

export function FeedbackWidget({
  propertyId,
  sectionKey,
  sectionLabel,
}: {
  propertyId: string | null;
  sectionKey: string;
  sectionLabel: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <VotePopover
        propertyId={propertyId}
        sectionKey={sectionKey}
        sectionLabel={sectionLabel}
        vote="up"
      />
      <VotePopover
        propertyId={propertyId}
        sectionKey={sectionKey}
        sectionLabel={sectionLabel}
        vote="down"
      />
    </div>
  );
}

function VotePopover({
  propertyId,
  sectionKey,
  sectionLabel,
  vote,
}: {
  propertyId: string | null;
  sectionKey: string;
  sectionLabel: string;
  vote: FeedbackVote;
}) {
  const submit = useServerFn(submitFeedback);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      submit({
        data: {
          propertyId,
          sectionKey,
          sectionLabel,
          vote,
          reasons,
          note: note.trim() || undefined,
          pagePath: typeof window !== "undefined" ? window.location.pathname : "",
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setReasons([]);
      setNote("");
      setSent(true);
      toast.success("Thanks for the feedback!");
      setTimeout(() => setSent(false), 2000);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't send feedback"),
  });

  const toggleReason = (reason: string) => {
    setReasons((rs) => (rs.includes(reason) ? rs.filter((r) => r !== reason) : [...rs, reason]));
  };

  const Icon = vote === "up" ? ThumbsUp : ThumbsDown;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label={vote === "up" ? "Good feedback" : "Bad feedback"}
        >
          {sent ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="mb-2 text-sm font-medium">
          {vote === "up" ? "What did you like?" : "What could be better?"}
        </p>
        <div className="flex flex-col gap-2">
          {reasonsFor(sectionKey, vote).map((reason) => (
            <label key={reason} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={reasons.includes(reason)}
                onCheckedChange={() => toggleReason(reason)}
                className="mt-0.5"
              />
              <span>{reason}</span>
            </label>
          ))}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything else? (optional)"
          className="mt-2 min-h-16 text-sm"
        />
        <Button
          size="sm"
          className="mt-2 w-full"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
        >
          Send feedback
        </Button>
      </PopoverContent>
    </Popover>
  );
}
