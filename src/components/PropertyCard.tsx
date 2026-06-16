import { Link } from "@tanstack/react-router";
import { Home, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtGBP } from "@/lib/format";

export interface PropertyCardData {
  p: any;
  a: any | null;
  bestFit: { name: string; score: number; strategy: string } | null;
  best: { name: string; dealScore: number; summary?: string } | null;
}

function scoreColor(score: number) {
  if (score >= 60) return "bg-primary text-primary-foreground";
  if (score >= 40) return "bg-amber-500 text-white";
  return "bg-muted text-muted-foreground";
}

/** Portrait card for the grid view — image top with score badge, details below. */
export function PropertyGridCard({
  data,
  selected,
  onSelect,
}: {
  data: PropertyCardData;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { p, a, bestFit, best } = data;
  const hero = p.image_urls?.[0] ?? null;

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Image */}
      <Link to="/properties/$id" params={{ id: p.id }} className="relative block shrink-0">
        <div className="aspect-[4/3] w-full bg-muted">
          {hero ? (
            <img src={hero} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Home className="h-8 w-8" />
            </div>
          )}
        </div>
        {a && (
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold shadow ${scoreColor(a.overallScore)}`}>
            {a.overallScore}
          </span>
        )}
      </Link>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {onSelect && (
          <div className="mb-1 flex items-center gap-1.5">
            <Checkbox checked={!!selected} onCheckedChange={onSelect} />
            <span className="text-xs text-muted-foreground">Select</span>
          </div>
        )}
        <Link
          to="/properties/$id"
          params={{ id: p.id }}
          className="line-clamp-2 text-sm font-semibold leading-snug hover:underline"
        >
          {p.hide_address ? "Address hidden" : p.address}
        </Link>
        <div className="flex flex-wrap gap-1">
          {p.beds && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{p.beds} bed</Badge>}
          {p.epc_rate && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">EPC {p.epc_rate}</Badge>}
          {bestFit && (
            <Badge className="h-5 bg-accent px-1.5 text-[10px] text-accent-foreground">◆ {bestFit.name}</Badge>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-1">
          <span className="text-sm font-medium">{fmtGBP(p.asking_price_gbp)}</span>
          {best && (
            <span className="text-xs text-muted-foreground">{best.name}</span>
          )}
          {p.source_link && (
            <a href={p.source_link} target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact card for map popups — horizontal layout, smaller. */
export function PropertyPopupCard({ data }: { data: PropertyCardData }) {
  const { p, a, best } = data;
  const hero = p.image_urls?.[0] ?? null;
  return (
    <div className="w-52">
      <div className="relative aspect-video w-full overflow-hidden rounded-t-md bg-muted">
        {hero ? (
          <img src={hero} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Home className="h-5 w-5" />
          </div>
        )}
        {a && (
          <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-px text-[10px] font-bold shadow ${scoreColor(a.overallScore)}`}>
            {a.overallScore}
          </span>
        )}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-semibold leading-snug">{p.hide_address ? "Address hidden" : p.address}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{fmtGBP(p.asking_price_gbp)}{best ? ` · ${best.name}` : ""}</p>
        <Button asChild size="sm" className="mt-2 h-7 w-full text-xs">
          <Link to="/properties/$id" params={{ id: p.id }}>Open</Link>
        </Button>
      </div>
    </div>
  );
}
