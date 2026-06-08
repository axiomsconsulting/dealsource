import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPhotos, addPhotoRecords, deletePhoto } from "@/lib/photos.functions";
import { analyseWithAI, getAIAnalysis, analysePhotosForRefurb } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtGBP } from "@/lib/format";
import JSZip from "jszip";

export function PhotosPanel({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listPhotos);
  const add = useServerFn(addPhotoRecords);
  const del = useServerFn(deletePhoto);
  const runAI = useServerFn(analyseWithAI);
  const getAI = useServerFn(getAIAnalysis);
  const runPhotoRefurb = useServerFn(analysePhotosForRefurb);

  const photos = useQuery({ queryKey: ["photos", propertyId], queryFn: () => list({ data: { propertyId } }) });
  const ai = useQuery({ queryKey: ["ai", propertyId], queryFn: () => getAI({ data: { propertyId } }) });

  const fileRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      // AI condition reports and refurb estimates are tied to the photos that existed when they
      // ran — silently swapping a same-named file out from under them would leave the report
      // describing a photo that's no longer there. Once analysis has run, same-name uploads are
      // skipped and the user must explicitly delete the old photo before adding the replacement.
      const aiDone = !!(ai.data as any)?.ai_used_at;
      const existing: any[] = photos.data ?? [];
      const replacing = new Set<string>();
      const uploaded: { storage_path: string; caption: string | null; is_exterior: boolean }[] = [];
      for (const f of files) {
        if (!f.type.startsWith("image/") && !f.name.match(/\.(jpe?g|png|webp)$/i)) continue;
        const collision = existing.find((p) => p.caption === f.name && !replacing.has(p.id));
        if (collision) {
          if (aiDone) {
            toast.error(`${f.name}: a photo with this name already exists and AI analysis has run on this property — delete the existing photo first, then re-upload.`);
            continue;
          }
          replacing.add(collision.id);
        }
        const path = `${user.id}/${propertyId}/${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("property-photos").upload(path, f, { upsert: false });
        if (error) { toast.error(`${f.name}: ${error.message}`); continue; }
        uploaded.push({ storage_path: path, caption: f.name, is_exterior: /front|exterior|outside|street/i.test(f.name) });
      }
      if (replacing.size) {
        await Promise.all(Array.from(replacing).map((id) => del({ data: { id } })));
      }
      if (uploaded.length) {
        await add({ data: { propertyId, photos: uploaded } });
        toast.success(`Uploaded ${uploaded.length} photo(s)${replacing.size ? ` (replaced ${replacing.size} same-named photo${replacing.size === 1 ? "" : "s"})` : ""}`);
        qc.invalidateQueries({ queryKey: ["photos", propertyId] });
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const onZip = async (file: File) => {
    setUploading(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const files: File[] = [];
      for (const name of Object.keys(zip.files)) {
        const entry = zip.files[name];
        if (entry.dir) continue;
        if (!name.match(/\.(jpe?g|png|webp)$/i)) continue;
        const blob = await entry.async("blob");
        files.push(new File([blob], name.split("/").pop()!, { type: "image/jpeg" }));
      }
      if (!files.length) { toast.error("No images in zip"); return; }
      await uploadFiles(files);
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", propertyId] }),
  });
  const aiMut = useMutation({
    mutationFn: () => runAI({ data: { propertyId } }),
    onSuccess: () => { toast.success("AI analysis complete"); qc.invalidateQueries({ queryKey: ["ai", propertyId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const refurbMut = useMutation({
    mutationFn: () => runPhotoRefurb({ data: { propertyId } }),
    onSuccess: (r: any) => {
      toast.success(`Found ${r.items?.length ?? 0} refurb items — populated estimator`);
      qc.invalidateQueries({ queryKey: ["ai", propertyId] });
      qc.invalidateQueries({ queryKey: ["property", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const findings = (ai.data as any)?.ai_notes;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Photos & AI condition report</span>
          <div className="flex gap-2">
            <Button
              size="sm" variant="outline"
              disabled={!photos.data?.length || refurbMut.isPending}
              onClick={() => refurbMut.mutate()}
              title="Vision-only refurb pass — populates the estimator from photos"
            >
              {refurbMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Analyse photos → refurb
            </Button>
            <Button
              size="sm" variant="default"
              disabled={!photos.data?.length || aiMut.isPending}
              onClick={() => aiMut.mutate()}
            >
              {aiMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Full AI analysis
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload photos
          </Button>
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => zipRef.current?.click()}>
            Upload .zip of photos
          </Button>
          <input type="file" accept="image/*" multiple hidden ref={fileRef}
            onChange={(e) => e.target.files && uploadFiles(Array.from(e.target.files))} />
          <input type="file" accept=".zip" hidden ref={zipRef}
            onChange={(e) => e.target.files?.[0] && onZip(e.target.files[0])} />
        </div>

        {photos.data && photos.data.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {photos.data.map((p: any) => (
              <div key={p.id} className="group relative overflow-hidden rounded-md border">
                {p.url && <img src={p.url} alt="" className="h-24 w-full object-cover" />}
                <button
                  onClick={() => { if (confirm("Delete this photo? This removes it from storage too.")) delMut.mutate(p.id); }}
                  title="Delete photo"
                  className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-70 hover:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                {p.is_exterior && <Badge className="absolute bottom-1 left-1 text-[9px]">exterior</Badge>}
              </div>
            ))}
          </div>
        )}

        {findings && (
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <p className="font-medium">AI surveyor findings</p>
              {findings.conditionScore != null && <Badge>Condition {findings.conditionScore}/10</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{findings.summary}</p>
            {findings.items?.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {findings.items.map((it: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded border bg-background p-2 text-sm">
                    <div>
                      <Badge variant="outline" className="mr-2 text-[10px] capitalize">{it.severity}</Badge>
                      <span className="font-medium capitalize">{it.area}:</span> {it.issue}
                    </div>
                    <span className="font-semibold">{fmtGBP(it.estimateGbp)}</span>
                  </div>
                ))}
              </div>
            )}
            {findings.negotiationAngles?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Negotiation angles</p>
                <ul className="mt-1 list-inside list-disc text-sm">
                  {findings.negotiationAngles.map((n: string, i: number) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}