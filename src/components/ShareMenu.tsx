import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Share2,
  Copy,
  Loader2,
  Users,
  FileText,
  MessageCircle,
  Mail,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { createPeerShare } from "@/lib/share.functions";
import { createOrUpdateDealSheet, getMyDealSheet } from "@/lib/deal-sheets.functions";
import { getMyShareDefaults } from "@/lib/share.functions";
import type { SliderOverrides } from "@/lib/analysis/types";

export function ShareMenu({
  propertyId,
  personaId,
  personaName,
  overrides,
  variant = "icon",
}: {
  propertyId: string;
  personaId?: string;
  personaName?: string;
  overrides?: SliderOverrides;
  variant?: "icon" | "button";
}) {
  const createPeer = useServerFn(createPeerShare);
  const createDeal = useServerFn(createOrUpdateDealSheet);
  const getDeal = useServerFn(getMyDealSheet);
  const getDefaults = useServerFn(getMyShareDefaults);

  const defaultsQ = useQuery({ queryKey: ["share-defaults"], queryFn: () => getDefaults() });
  const dealQ = useQuery({
    queryKey: ["dealsheet", propertyId],
    queryFn: () => getDeal({ data: { propertyId } }),
  });

  const peerMut = useMutation({
    mutationFn: () => createPeer({ data: { propertyId } }),
  });

  const dealMut = useMutation({
    mutationFn: async () => {
      const d = defaultsQ.data;
      return createDeal({
        data: {
          propertyId,
          personaId,
          overrides: (overrides ?? {}) as any,
          is_public: true,
          redact: d?.redact ?? true,
          hide_address: d?.hide_address ?? false,
          hide_photos: d?.hide_photos ?? false,
          include_refurb_breakdown: d?.include_refurb_breakdown ?? true,
          include_risk_flags: d?.include_risk_flags ?? true,
        },
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const peerToken = peerMut.data?.token;
  const dealToken = (dealMut.data as any)?.share_token ?? (dealQ.data as any)?.share_token;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const peerUrl = peerToken ? `${origin}/share/${peerToken}` : "";
  const dealUrl = dealToken ? `${origin}/deal-sheet?t=${encodeURIComponent(dealToken)}` : "";
  const pdfUrl = dealToken ? `/api/deal-pdf/${dealToken}` : "";

  const copy = (s: string, label: string) => {
    navigator.clipboard.writeText(s).then(() => toast.success(`${label} copied`));
  };

  const nativeShare = (url: string, title: string) => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      (navigator as any).share({ title, url }).catch(() => {});
    } else {
      copy(url, "Link");
    }
  };

  const trigger =
    variant === "icon" ? (
      <Button variant="ghost" size="icon" className="shrink-0" title="Share">
        <Share2 className="h-5 w-5" />
      </Button>
    ) : (
      <Button variant="outline" size="sm" className="px-2 sm:px-3">
        <Share2 className="h-4 w-4 sm:mr-2" />
        <span className="sm:inline">Share</span>
      </Button>
    );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b p-3">
          <p className="text-sm font-semibold">Share this deal</p>
          <p className="text-xs text-muted-foreground">
            Privacy uses your saved share defaults — change in Profile.
          </p>
        </div>

        {/* Peer share */}
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" /> Share with another app user
          </div>
          <p className="text-xs text-muted-foreground">
            They can preview and add it to their own deal library. Sign-in required to claim.
          </p>
          {peerUrl ? (
            <ShareRow url={peerUrl} onShare={() => nativeShare(peerUrl, "Property deal")} />
          ) : (
            <Button
              size="sm"
              onClick={() => peerMut.mutate()}
              disabled={peerMut.isPending}
              className="w-full"
            >
              {peerMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate share link
            </Button>
          )}
        </div>

        {/* Investor deal sheet */}
        <div className="space-y-2 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <FileText className="h-4 w-4 text-primary" /> Send investor deal sheet
          </div>
          {personaName && (
            <p className="text-xs text-muted-foreground">
              Snapshot uses investor profile: <span className="font-medium">{personaName}</span>
            </p>
          )}
          {dealUrl ? (
            <>
              <ShareRow url={dealUrl} onShare={() => nativeShare(dealUrl, "Investor deal sheet")} />
              <div className="flex gap-1.5">
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> PDF
                  </Button>
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(dealUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1"
                >
                  <Button variant="outline" size="sm" className="w-full">
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                  </Button>
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent("Investment opportunity")}&body=${encodeURIComponent(dealUrl)}`}
                  className="flex-1"
                >
                  <Button variant="outline" size="sm" className="w-full">
                    <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
                  </Button>
                </a>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs"
                onClick={() => dealMut.mutate()}
                disabled={dealMut.isPending}
              >
                {dealMut.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                Refresh snapshot
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => dealMut.mutate()}
              disabled={dealMut.isPending}
              className="w-full"
            >
              {dealMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate investor sheet
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ShareRow({ url, onShare }: { url: string; onShare: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input value={url} readOnly className="h-8 font-mono text-xs" />
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(url);
          toast.success("Link copied");
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        onClick={onShare}
        title="Share"
      >
        <Share2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}