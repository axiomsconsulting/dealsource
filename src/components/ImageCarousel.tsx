import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CarouselImage {
  url: string;
  /** Short tag describing what the image shows — e.g. "Lounge with bay window". Algorithmic or
   *  AI-derived; shown as an overlay so the viewer always knows what they're looking at. */
  label?: string;
}

/** Shared fullscreen lightbox with next/previous navigation — used by both the hero gallery and
 *  the image library so "view fullscreen" behaves identically (and the same tags show) wherever
 *  the photo was clicked from. */
export function ImageCarousel({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: CarouselImage[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  if (index == null || !images.length) return null;
  const safeIndex = ((index % images.length) + images.length) % images.length;
  const current = images[safeIndex];
  const go = (delta: number) => onIndexChange((safeIndex + delta + images.length) % images.length);

  return (
    <Dialog open={index != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-5xl overflow-hidden border-0 bg-black p-0"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "ArrowRight") go(1);
        }}
      >
        <div className="relative flex items-center justify-center">
          <img src={current.url} alt={current.label ?? ""} className="max-h-[82vh] w-full object-contain" />

          {current.label && (
            <Badge className="absolute left-3 top-3 bg-black/70 text-white backdrop-blur-sm">{current.label}</Badge>
          )}
          <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white/80">
            {safeIndex + 1} / {images.length}
          </span>

          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                onClick={() => go(-1)}
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                onClick={() => go(1)}
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
