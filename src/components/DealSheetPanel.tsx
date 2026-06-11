import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createOrUpdateDealSheet, getMyDealSheet } from "@/lib/deal-sheets.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, FileDown, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SliderOverrides } from "@/lib/analysis/types";
import { useState } from "react";

export function DealSheetPanel({
  propertyId,
  overrides,
  personaId,
  personaName,
}: {
  propertyId: string;
  overrides: SliderOverrides;
  personaId: string;
  personaName: string;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createOrUpdateDealSheet);
  const get = useServerFn(getMyDealSheet);
  const sheet = useQuery({
    queryKey: ["dealsheet", propertyId],
    queryFn: () => get({ data: { propertyId } }),
  });
  const [redact, setRedact] = useState(true);
  const [hideAddress, setHideAddress] = useState(false);
  const [hidePhotos, setHidePhotos] = useState(false);
  const [includeRefurb, setIncludeRefurb] = useState(true);
  const [includeRisk, setIncludeRisk] = useState(true);

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          propertyId,
          redact,
          is_public: true,
          overrides: overrides as any,
          personaId,
          hide_address: hideAddress,
          hide_photos: hidePhotos,
          include_refurb_breakdown: includeRefurb,
          include_risk_flags: includeRisk,
        },
      }),
    onSuccess: () => {
      toast.success("Deal sheet ready");
      qc.invalidateQueries({ queryKey: ["dealsheet", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const token = (sheet.data as any)?.share_token;
  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/deal-sheet?t=${encodeURIComponent(token)}`
    : "";
  const pdfUrl = token ? `/api/deal-pdf/${token}` : "";

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Investor PDF privacy
        </p>
        <Toggle
          id="hideAddress"
          label="Hide exact address (show area only)"
          v={hideAddress}
          on={setHideAddress}
        />
        <Toggle id="hidePhotos" label="Hide all photos" v={hidePhotos} on={setHidePhotos} />
        <Toggle id="redact" label="Mark exterior photos as redacted" v={redact} on={setRedact} />
        <Toggle
          id="includeRefurb"
          label="Include refurb breakdown"
          v={includeRefurb}
          on={setIncludeRefurb}
        />
        <Toggle id="includeRisk" label="Include risk flags" v={includeRisk} on={setIncludeRisk} />
      </div>
      <p className="text-xs text-muted-foreground">
        Snapshot will use investor criteria:{" "}
        <span className="font-medium text-foreground">{personaName}</span>
      </p>
      <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {token ? "Update deal sheet" : "Generate deal sheet"}
      </Button>
      {token && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Input value={shareUrl} readOnly className="font-mono text-xs" />
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <a href={shareUrl} target="_blank" rel="noreferrer">
              <Button size="icon" variant="outline">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
          <a href={pdfUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="w-full">
              <FileDown className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}

function Toggle({
  id,
  label,
  v,
  on,
}: {
  id: string;
  label: string;
  v: boolean;
  on: (b: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={v} onCheckedChange={on} />
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
    </div>
  );
}
