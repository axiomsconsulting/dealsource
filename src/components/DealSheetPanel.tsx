import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createOrUpdateDealSheet, getMyDealSheet } from "@/lib/deal-sheets.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, FileDown, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SliderOverrides } from "@/lib/analysis/types";
import { useState } from "react";

export function DealSheetPanel({ propertyId, overrides }: { propertyId: string; overrides: SliderOverrides }) {
  const qc = useQueryClient();
  const create = useServerFn(createOrUpdateDealSheet);
  const get = useServerFn(getMyDealSheet);
  const sheet = useQuery({ queryKey: ["dealsheet", propertyId], queryFn: () => get({ data: { propertyId } }) });
  const [redact, setRedact] = useState(true);

  const mut = useMutation({
    mutationFn: () => create({ data: { propertyId, redact, is_public: true, overrides: overrides as any } }),
    onSuccess: () => { toast.success("Deal sheet ready"); qc.invalidateQueries({ queryKey: ["dealsheet", propertyId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const token = (sheet.data as any)?.share_token;
  const shareUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/deal/${token}` : "";
  const pdfUrl = token ? `/api/deal-pdf/${token}` : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deal sheet for investors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Switch id="redact" checked={redact} onCheckedChange={setRedact} />
          <Label htmlFor="redact" className="text-sm">Redact address & exterior photos</Label>
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {token ? "Update deal sheet" : "Generate deal sheet"}
        </Button>
        {token && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success("Link copied"); }}>
                <Copy className="h-4 w-4" />
              </Button>
              <a href={shareUrl} target="_blank" rel="noreferrer"><Button size="icon" variant="outline"><ExternalLink className="h-4 w-4" /></Button></a>
            </div>
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="w-full"><FileDown className="mr-2 h-4 w-4" /> Download PDF</Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}