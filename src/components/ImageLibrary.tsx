import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Images, Loader2, Wand2 } from "lucide-react";
import { ImageCarousel } from "@/components/ImageCarousel";
import { categoriseListingImages, getAIAnalysis, ROOM_LABELS } from "@/lib/ai.functions";
import { toast } from "sonner";

const ROOM_ORDER = ["lounge", "dining", "kitchen", "bedroom", "bathroom", "garden", "landing", "exterior", "other"] as const;

export function ImageLibrary({ propertyId, urls }: { propertyId: string; urls: string[] }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const tagFn = useServerFn(categoriseListingImages);
  const getAI = useServerFn(getAIAnalysis);

  // De-duplicate — listings frequently repeat the same photo (different sizes/CDNs) across the
  // image array, and showing the same room twice undermines trust in the "library" framing.
  const deduped = useMemo(() => Array.from(new Set((urls ?? []).filter(Boolean))), [urls]);

  const ai = useQuery({
    queryKey: ["ai", propertyId],
    queryFn: () => getAI({ data: { propertyId } }),
    enabled: expanded,
  });
  const tagsByUrl: Record<string, { room: string; label: string }> = (ai.data as any)?.ai_payload?.imageTags?.byUrl ?? {};
  const hasTags = Object.keys(tagsByUrl).length > 0;

  const tagMut = useMutation({
    mutationFn: () => tagFn({ data: { propertyId } }),
    onSuccess: () => { toast.success("Photos organised by room"); qc.invalidateQueries({ queryKey: ["ai", propertyId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Carousel images carry whatever tag we have (falls back to no label) — same set, same order,
  // for both the grouped view and the lightbox so "N / total" and prev/next stay coherent.
  const carouselImages = useMemo(
    () => deduped.map((u) => ({ url: u, label: tagsByUrl[u]?.label })),
    [deduped, tagsByUrl],
  );

  const groups = useMemo(() => {
    if (!hasTags) return null;
    const byRoom = new Map<string, { url: string; index: number; label: string }[]>();
    deduped.forEach((u, i) => {
      const tag = tagsByUrl[u];
      const room = tag?.room ?? "other";
      if (!byRoom.has(room)) byRoom.set(room, []);
      byRoom.get(room)!.push({ url: u, index: i, label: tag?.label ?? "" });
    });
    return ROOM_ORDER.map((room) => ({ room, label: ROOM_LABELS[room], items: byRoom.get(room) ?? [] })).filter((g) => g.items.length > 0);
  }, [deduped, tagsByUrl, hasTags]);

  if (!deduped.length) return null;

  return (
    <Card id="image-library">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2"><Images className="h-4 w-4" /> Image library ({deduped.length})</span>
          <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> : <ChevronDown className="mr-1.5 h-3.5 w-3.5" />}
            {expanded ? "Collapse" : "Expand library"}
          </Button>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {!hasTags && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground">
                Organise these photos into lounge, dining, kitchen, bedrooms, garden, landing and outside automatically — a one-off AI pass that's cached for next time.
              </p>
              <Button size="sm" disabled={tagMut.isPending} onClick={() => tagMut.mutate()}>
                {tagMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                Organise into rooms
              </Button>
            </div>
          )}

          {groups ? (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.room}>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label} <Badge variant="outline" className="text-[10px] font-normal normal-case">{g.items.length}</Badge>
                  </p>
                  <Thumbs items={g.items} onOpen={setOpenIndex} />
                </div>
              ))}
            </div>
          ) : (
            <Thumbs items={deduped.map((url, index) => ({ url, index, label: tagsByUrl[url]?.label ?? "" }))} onOpen={setOpenIndex} />
          )}
        </CardContent>
      )}

      <ImageCarousel images={carouselImages} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
    </Card>
  );
}

function Thumbs({ items, onOpen }: { items: { url: string; index: number; label: string }[]; onOpen: (i: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
      {items.map((it) => (
        <button key={it.index} onClick={() => onOpen(it.index)} className="group relative overflow-hidden rounded-md border bg-muted">
          <img src={it.url} alt={it.label} className="h-24 w-full object-cover transition group-hover:scale-105" loading="lazy" />
          {it.label && (
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-left text-[10px] text-white">
              {it.label}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
