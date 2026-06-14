import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { startLibraryAIJob, getAIJob, cancelAIJob } from "@/lib/ai-jobs.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function BatchAIDialog({ totalProperties, alreadyAnalysed, onDone }: { totalProperties: number; alreadyAnalysed: number; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const start = useServerFn(startLibraryAIJob);
  const get = useServerFn(getAIJob);
  const cancel = useServerFn(cancelAIJob);

  const job = useQuery({
    queryKey: ["ai_job", jobId],
    queryFn: () => get({ data: { jobId: jobId! } }),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data as any)?.status === "done" || (q.state.data as any)?.status === "cancelled" ? false : 1200,
  });

  const startMut = useMutation({
    mutationFn: () => start({ data: { force, limit: 100 } }),
    onSuccess: (r: any) => { setJobId(r.jobId); toast.success(`Started: ${r.total} properties`); },
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    const j: any = job.data;
    if (j?.status === "done" || j?.status === "cancelled") onDone?.();
  }, [job.data, onDone]);

  const j: any = job.data;
  const pct = j ? Math.round(((j.completed + j.errors) / Math.max(1, j.total)) * 100) : 0;
  const eligible = force ? totalProperties : totalProperties - alreadyAnalysed;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="w-full sm:w-auto" disabled={!totalProperties}>
          <Sparkles className="mr-2 h-4 w-4" />
          Batch AI analyse
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Batch AI analysis</DialogTitle>
        </DialogHeader>
        {!jobId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Runs one AI pass per property covering condition, refurb, rent, risk, Article 4 and negotiation. <strong>1 credit per property.</strong>
            </p>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between"><span>Total properties</span><span className="font-medium">{totalProperties}</span></div>
              <div className="flex justify-between"><span>Already analysed</span><span className="font-medium">{alreadyAnalysed}</span></div>
              <div className="mt-2 flex justify-between border-t pt-2"><span>Will analyse now</span><span className="font-semibold text-primary">{eligible}</span></div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Est credits</span><span>~{eligible}</span></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="force" checked={force} onCheckedChange={setForce} />
              <Label htmlFor="force" className="text-sm">Re-run on already-analysed properties</Label>
            </div>
            <Button onClick={() => startMut.mutate()} disabled={startMut.isPending || eligible === 0} className="w-full">
              {startMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run on {eligible} {eligible === 1 ? "property" : "properties"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-sm"><span>{j?.status === "done" ? "Complete" : j?.status === "cancelled" ? "Cancelled" : "Running…"}</span><span className="text-muted-foreground">{j?.completed ?? 0}/{j?.total ?? 0}</span></div>
              <Progress value={pct} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="Done" v={j?.completed ?? 0} accent="text-primary" />
              <Stat label="Errors" v={j?.errors ?? 0} accent="text-destructive" />
              <Stat label="Remaining" v={Math.max(0, (j?.total ?? 0) - (j?.completed ?? 0) - (j?.errors ?? 0))} />
            </div>
            {j?.last_error && <p className="text-xs text-destructive">Last error: {j.last_error}</p>}
            {j?.status === "done" || j?.status === "cancelled" ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
                <p>Analysed <strong>{j.completed}</strong>, <strong>{j.errors}</strong> errors.</p>
                <p className="text-xs text-muted-foreground">~{j.completed} credits used</p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => { setJobId(null); setOpen(false); }}>Close</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => jobId && cancel({ data: { jobId } })} className="w-full">Cancel</Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, v, accent }: { label: string; v: number; accent?: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className={`text-xl font-bold ${accent ?? ""}`}>{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}