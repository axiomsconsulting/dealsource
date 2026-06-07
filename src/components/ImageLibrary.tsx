import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Images } from "lucide-react";

export function ImageLibrary({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!urls?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Images className="h-4 w-4" /> Image library ({urls.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {urls.map((u, i) => (
            <button key={i} onClick={() => setOpen(u)} className="overflow-hidden rounded-md border bg-muted">
              <img src={u} alt="" className="h-24 w-full object-cover transition hover:scale-105" loading="lazy" />
            </button>
          ))}
        </div>
      </CardContent>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-4xl p-0">
          {open && <img src={open} alt="" className="h-auto w-full" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}