import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Camera, ImagePlus, Loader2, Mic, MicOff, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SurveyFindings, SurveySeverity } from "@/lib/analysis/types";
import type { SurveyIssueKey } from "@/lib/analysis/survey-strategy";
import { computeSurveyLeverage } from "@/lib/analysis/survey-strategy";
import { updateProperty } from "@/lib/ingest.functions";
import { listPhotos, addPhotoRecords, deletePhoto } from "@/lib/photos.functions";
import { analyseViewingNotes } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { fmtGBP } from "@/lib/format";

/** Maps an AI-identified survey issue onto the refurb estimator's line-item category and a
 *  tier, so a viewing note like "damp patch in the kitchen" both becomes negotiation leverage
 *  (via `survey_findings`) AND ticks/sets the matching line in the Refurb & EPC estimator. */
const ISSUE_TO_REFURB_CATEGORY: Partial<Record<SurveyIssueKey, string>> = {
  damp: "damp",
  structural: "damp",
  roof: "roof",
  windows_joinery: "windows",
  electrics_plumbing: "rewire",
  insulation_energy: "epc_upgrade",
  external_grounds: "external",
  timber_decay: "external",
};

const SEVERITY_TO_TIER: Record<SurveySeverity, "low" | "mid" | "high"> = {
  low: "low",
  medium: "mid",
  high: "high",
};

type Area = { key: string; label: string };

function buildAreas(property: any): Area[] {
  const beds = Math.max(1, Math.min(8, Math.round(Number(property?.beds) || 1)));
  const bedroomAreas: Area[] =
    beds > 1
      ? Array.from({ length: beds }, (_, i) => ({ key: `bedroom_${i + 1}`, label: `Bedroom ${i + 1}` }))
      : [{ key: "bedroom", label: "Bedroom" }];
  return [
    { key: "inside", label: "Inside (general)" },
    { key: "outside", label: "Outside (general)" },
    { key: "kitchen", label: "Kitchen" },
    { key: "lounge", label: "Lounge" },
    { key: "dining", label: "Dining room" },
    ...bedroomAreas,
    { key: "bathroom", label: "Bathroom" },
    { key: "garden", label: "Garden" },
    { key: "outbuilding", label: "Outbuilding / garage" },
    { key: "roof", label: "Roof / loft" },
  ];
}

/** On-site capture for a property viewing: free-form notes — a general box plus one box per
 *  area (kitchen, bedrooms, garden, roof, etc.) — with an optional photo per area, and a single
 *  "Analyse with AI" pass that reads everything written (wherever it was written) and maps it
 *  onto the fixed survey-issue taxonomy with a severity. The result feeds straight into
 *  `survey_findings` (negotiation leverage / talking points) and into the refurb estimator's
 *  matching line items. */
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
  const analyseNotesFn = useServerFn(analyseViewingNotes);

  const areas = buildAreas(property);
  const [notes, setNotes] = useState<Record<string, string>>(() => (property.viewing_notes as any) ?? {});
  const [analysing, setAnalysing] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const libraryRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const photos = useQuery({
    queryKey: ["photos", property.id],
    queryFn: () => listPhotosFn({ data: { propertyId: property.id } }),
  });

  const saveNotesMut = useMutation({
    mutationFn: (next: Record<string, string>) =>
      update({ data: { id: property.id, patch: { viewing_notes: next as any } } }),
  });

  const setAreaNote = (key: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev, [key]: text };
      return next;
    });
  };

  // Debounced autosave of notes
  useEffect(() => {
    const t = setTimeout(() => saveNotesMut.mutate(notes), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  useEffect(() => {
    return () => {
      try {
        recogRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const toggleListening = () => {
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice dictation isn't supported in this browser");
      return;
    }
    const recog = new SR();
    recog.lang = "en-GB";
    recog.continuous = true;
    recog.interimResults = false;
    recog.onresult = (e: any) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      if (!transcript.trim()) return;
      setNotes((prev) => {
        const existing = prev.general ?? "";
        const sep = existing && !existing.endsWith(" ") ? " " : "";
        return { ...prev, general: `${existing}${sep}${transcript.trim()} ` };
      });
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recog.start();
    recogRef.current = recog;
    setListening(true);
  };

  const uploadFiles = async (areaKey: string, files: File[]) => {
    if (!files.length) return;
    setUploading(areaKey);
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
        uploaded.push({ storage_path: path, caption: f.name, issue_key: areaKey });
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

  const runAnalysis = async () => {
    setAnalysing(true);
    try {
      const result = await analyseNotesFn({ data: { propertyId: property.id, notes } });
      if (!result.findings.length) {
        toast.info("No issues found in the notes — try adding more detail.");
        return;
      }
      const nextFindings: SurveyFindings = { ...((property.survey_findings as any) ?? {}) };
      const severityHints: Record<string, "low" | "mid" | "high"> = {};
      for (const f of result.findings) {
        nextFindings[f.issueKey] = { active: true, severity: f.severity, note: f.note };
        const category = ISSUE_TO_REFURB_CATEGORY[f.issueKey];
        if (category) severityHints[category] = SEVERITY_TO_TIER[f.severity];
      }
      onLiveChange?.(nextFindings);
      await update({
        data: {
          id: property.id,
          patch: {
            survey_findings: nextFindings as any,
            ...(Object.keys(severityHints).length
              ? {
                  refurb_estimate: {
                    ...((property.refurb_estimate as any) ?? {}),
                    severityHints,
                  } as any,
                }
              : {}),
          },
        },
      });
      qc.invalidateQueries({ queryKey: ["property", property.id] });
      const { totalLeverage } = computeSurveyLeverage({ ...property, survey_findings: nextFindings } as any);
      toast.success(
        `Found ${result.findings.length} issue(s) — ~${fmtGBP(totalLeverage)} of negotiation leverage, refurb estimator updated`,
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAnalysing(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Jot down what you see — anywhere, in any box — and snap a photo if useful. When you're
        done, hit "Analyse with AI" and it'll pick out the issues, set their severity, fold them
        into your negotiation leverage and update the refurb estimator.
      </p>

      <div className="rounded-md border p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">General notes</p>
          <Button
            type="button"
            size="sm"
            variant={listening ? "default" : "outline"}
            onClick={toggleListening}
          >
            {listening ? <MicOff className="mr-1.5 h-4 w-4" /> : <Mic className="mr-1.5 h-4 w-4" />}
            {listening ? "Stop dictation" : "Dictate"}
          </Button>
        </div>
        <Textarea
          placeholder="Anything overall — first impressions, smells, noise, neighbours, anything that doesn't fit a specific room…"
          value={notes.general ?? ""}
          onChange={(e) => setAreaNote("general", e.target.value)}
          className="min-h-[80px] text-sm"
        />
      </div>

      <Button type="button" disabled={analysing} onClick={runAnalysis} className="w-full sm:w-auto">
        {analysing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Analyse with AI
      </Button>

      {areas.map((area) => {
        const areaPhotos = (photos.data ?? []).filter((ph: any) => ph.issue_key === area.key);
        return (
          <div key={area.key} className="rounded-md border p-3">
            <p className="mb-1.5 font-medium">{area.label}</p>
            <Textarea
              placeholder={`Notes for ${area.label.toLowerCase()}…`}
              value={notes[area.key] ?? ""}
              onChange={(e) => setAreaNote(area.key, e.target.value)}
              className="min-h-[60px] text-sm"
            />

            {areaPhotos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {areaPhotos.map((ph: any) => (
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
                ref={(el) => { cameraRefs.current[area.key] = el; }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(area.key, Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <input
                ref={(el) => { libraryRefs.current[area.key] = el; }}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(area.key, Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={uploading === area.key}
                onClick={() => cameraRefs.current[area.key]?.click()}
              >
                {uploading === area.key ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                )}
                Take photo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={uploading === area.key}
                onClick={() => libraryRefs.current[area.key]?.click()}
              >
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                Add from library
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
