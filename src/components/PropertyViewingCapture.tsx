import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Camera, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { buildSurveyStrategy, type SurveyIssueKey } from "@/lib/analysis/survey-strategy";
import type { SurveyFindings, SurveySeverity } from "@/lib/analysis/types";
import { updateProperty } from "@/lib/ingest.functions";
import { listPhotos, addPhotoRecords, deletePhoto } from "@/lib/photos.functions";
import { analyseViewingIssuePhotos } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { fmtGBP } from "@/lib/format";

const SHORT_LABEL: Record<SurveyIssueKey, string> = {
  non_standard_construction: "Non-standard construction",
  structural: "Structural (cracks, movement)",
  roof: "Roof",
  asbestos: "Asbestos",
  damp: "Damp",
  timber_decay: "Timber decay",
  windows_joinery: "Windows & joinery",
  drainage_rainwater: "Drainage & rainwater",
  electrics_plumbing: "Electrics & plumbing",
  insulation_energy: "Insulation & energy",
  japanese_knotweed: "Japanese knotweed",
  external_grounds: "External & garden",
};

const SEVERITY_RATIO: Record<SurveySeverity, number> = { low: 0, medium: 0.5, high: 1 };

/** On-site capture for a property viewing: for each survey-strategy issue, a quick tick +
 *  severity + freeform note, plus camera/library photo capture tagged to that issue and an
 *  "Analyse with AI" pass that suggests severity/note/cost from the photos. Persists straight
 *  into `property.survey_findings`, so anything ticked here immediately becomes negotiation
 *  leverage (see `buildSurveyNegotiationPoints`) and appears in the talking points script. */
export function PropertyViewingCapture({
  property,
  onLiveChange,
}: {
  property: any;
  onLiveChange?: (findings: SurveyFindings) => void;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateProperty);
  const listPhotosFn = useServerFn(listPhotos);
  const addPhotosFn = useServerFn(addPhotoRecords);
  const deletePhotoFn = useServerFn(deletePhoto);
  const analyseIssueFn = useServerFn(analyseViewingIssuePhotos);

  const issues = buildSurveyStrategy(property);
  const asking = Number(property.asking_price_gbp ?? 0);

  const [local, setLocal] = useState<SurveyFindings>((property.survey_findings as any) ?? {});
  const [uploading, setUploading] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState<string | null>(null);
  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const libraryRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const photos = useQuery({
    queryKey: ["photos", property.id],
    queryFn: () => listPhotosFn({ data: { propertyId: property.id } }),
  });

  const saveMut = useMutation({
    mutationFn: (patch: SurveyFindings) =>
      update({ data: { id: property.id, patch: { survey_findings: patch as any } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property", property.id] }),
  });

  const persist = (next: SurveyFindings) => {
    setLocal(next);
    onLiveChange?.(next);
    saveMut.mutate(next);
  };

  const toggle = (key: string, active: boolean) => {
    persist({
      ...local,
      [key]: { ...(local[key] ?? { severity: "medium" as SurveySeverity }), active },
    });
  };
  const setSeverity = (key: string, severity: SurveySeverity) => {
    persist({
      ...local,
      [key]: { ...(local[key] ?? { active: true }), active: true, severity },
    });
  };
  const setNote = (key: string, note: string) => {
    setLocal((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { active: false, severity: "medium" as SurveySeverity }), note },
    }));
  };
  const saveNote = () => {
    onLiveChange?.(local);
    saveMut.mutate(local);
  };

  const uploadFiles = async (issueKey: string, files: File[]) => {
    if (!files.length) return;
    setUploading(issueKey);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const uploaded: { storage_path: string; caption: string | null; issue_key: string }[] = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) continue;
        const path = `${user.id}/${property.id}/${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("property-photos").upload(path, f, { upsert: false });
        if (error) {
          toast.error(`${f.name}: ${error.message}`);
          continue;
        }
        uploaded.push({ storage_path: path, caption: f.name, issue_key: issueKey });
      }
      if (uploaded.length) {
        await addPhotosFn({ data: { propertyId: property.id, photos: uploaded } });
        qc.invalidateQueries({ queryKey: ["photos", property.id] });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(null);
    }
  };

  const removePhoto = async (id: string) => {
    await deletePhotoFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["photos", property.id] });
  };

  const runAnalysis = async (issueKey: string) => {
    setAnalysing(issueKey);
    try {
      const result = await analyseIssueFn({ data: { propertyId: property.id, issueKey } });
      persist({
        ...local,
        [issueKey]: { active: true, severity: result.severity, note: result.note },
      });
      toast.success(`Suggested: ${result.severity} severity, ~${fmtGBP(result.estimateGbp)} to remediate`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAnalysing(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Tick anything you spot, set its severity, jot a quick note, and snap a photo — each one
        feeds straight into the negotiation playbook and talking points.
      </p>
      {issues.map((issue) => {
        const f = local[issue.key];
        const active = !!f?.active;
        const severity = f?.severity ?? "medium";
        const ratio = SEVERITY_RATIO[severity];
        const estimateGbp =
          asking > 0
            ? Math.round(asking * (issue.markdownLowPct + (issue.markdownHighPct - issue.markdownLowPct) * ratio))
            : 0;
        const issuePhotos = (photos.data ?? []).filter((ph: any) => ph.issue_key === issue.key);

        return (
          <div
            key={issue.key}
            className={`rounded-md border p-3 ${active ? "border-primary bg-primary/5" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Checkbox checked={active} onCheckedChange={(b) => toggle(issue.key, !!b)} />
              <p className="font-medium">{SHORT_LABEL[issue.key]}</p>
              <ToggleGroup
                type="single"
                size="sm"
                value={severity}
                onValueChange={(v) => v && setSeverity(issue.key, v as SurveySeverity)}
              >
                {(["low", "medium", "high"] as SurveySeverity[]).map((s) => (
                  <ToggleGroupItem
                    key={s}
                    value={s}
                    className="h-6 px-2 text-[10px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {s[0].toUpperCase()}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {active && estimateGbp > 0 && (
                <span className="ml-auto text-sm font-semibold text-primary">−{fmtGBP(estimateGbp)}</span>
              )}
            </div>

            <Textarea
              placeholder="Quick note — what you saw, where, how bad…"
              value={f?.note ?? ""}
              onChange={(e) => setNote(issue.key, e.target.value)}
              onBlur={saveNote}
              className="mt-2 min-h-[60px] text-sm"
            />

            {issuePhotos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {issuePhotos.map((ph: any) => (
                  <div key={ph.id} className="group relative h-16 w-16 overflow-hidden rounded-md border">
                    {ph.url && <img src={ph.url} alt="" className="h-full w-full object-cover" />}
                    <button
                      type="button"
                      onClick={() => removePhoto(ph.id)}
                      className="absolute right-0.5 top-0.5 hidden rounded-sm bg-background/80 p-0.5 group-hover:block"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={(el) => { cameraRefs.current[issue.key] = el; }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(issue.key, Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <input
                ref={(el) => { libraryRefs.current[issue.key] = el; }}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(issue.key, Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={uploading === issue.key}
                onClick={() => cameraRefs.current[issue.key]?.click()}
              >
                {uploading === issue.key ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                )}
                Take photo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={uploading === issue.key}
                onClick={() => libraryRefs.current[issue.key]?.click()}
              >
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                Add from library
              </Button>
              {issuePhotos.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={analysing === issue.key}
                  onClick={() => runAnalysis(issue.key)}
                >
                  {analysing === issue.key ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Analyse with AI
                </Button>
              )}
              {issue.signal !== "routine" && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {issue.signal === "flagged" ? "Flagged from the data" : "Worth watching"}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
