import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createOrUpdateDealSheet, getMyDealSheet } from "@/lib/deal-sheets.functions";
import { getMyShareDefaults } from "@/lib/share.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, FileDown, ExternalLink, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import type { SliderOverrides } from "@/lib/analysis/types";
import { Link } from "@tanstack/react-router";

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
  const getDefaults = useServerFn(getMyShareDefaults);
  const sheet = useQuery({
    queryKey: ["dealsheet", propertyId],
    queryFn: () => get({ data: { propertyId } }),
  });
  const defaultsQ = useQuery({ queryKey: ["share-defaults"], queryFn: () => getDefaults() });
  const d = defaultsQ.data;

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          propertyId,
          redact: d?.redact ?? true,
          is_public: true,
          overrides: overrides as any,
          personaId,
          hide_address: d?.hide_address ?? false,
          hide_photos: d?.hide_photos ?? false,
          include_refurb_breakdown: d?.include_refurb_breakdown ?? true,
          include_risk_flags: d?.include_risk_flags ?? true,
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
      <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
        <div className="space-y-0.5 text-xs">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">
            Sharing privacy
          </p>
          <p className="text-muted-foreground">
            {d
              ? [
                  d.hide_address ? "address hidden" : "address shown",
                  d.hide_photos ? "photos hidden" : d.redact ? "exterior redacted" : "photos shown",
                  d.include_refurb_breakdown ? "refurb included" : "refurb hidden",
                  d.include_risk_flags ? "risk flags included" : "risk hidden",
                ].join(" · ")
              : "Loading defaults…"}
          </p>
        </div>
        <Link to="/profile" search={{ tab: "share" } as any}>
          <Button size="sm" variant="outline">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Edit defaults
          </Button>
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Snapshot will use investor criteria:{" "}
        <span className="font-medium text-foreground">{personaName}</span>
      </p>
      <Button onClick={() => mut.mutate()} disabled={mut.isPending || !d}>
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
