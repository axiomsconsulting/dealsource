import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Camera,
  Check,
  History,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { SurveyFindings, SurveySeverity } from "@/lib/analysis/types";
import type { SurveyIssueKey } from "@/lib/analysis/survey-strategy";
import { computeSurveyLeverage } from "@/lib/analysis/survey-strategy";
import { updateProperty } from "@/lib/ingest.functions";
import { listPhotos, addPhotoRecords, deletePhoto } from "@/lib/photos.functions";
import { analyseViewingNotes } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { fmtGBP } from "@/lib/format";
import { cn } from "@/lib/utils";

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

/** Tidies a raw speech-to-text chunk into a polished sentence: collapses whitespace,
 *  capitalises the first letter, and ensures terminal punctuation. */
function polishTranscript(text: string): string {
  let t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += ".";
  return `${t} `;
}

/** Turns a camelCase / snake_case key into "Title Case" for display. */
function labelizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Renders whatever shape `userInputs` happens to be (the freeform notes/answers a user
 *  entered against this property in the Property Filter app) as plain lines of text, so
 *  they don't silently get dropped on import — they land in General notes instead. */
function formatUserInputs(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  const lines: string[] = [];
  const walk = (node: any, prefix: string) => {
    if (node == null || node === "") return;
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      lines.push(prefix ? `${prefix}: ${node}` : String(node));
    } else if (Array.isArray(node)) {
      node.forEach((v) => walk(v, prefix));
    } else if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        walk(v, prefix ? `${prefix} — ${labelizeKey(k)}` : labelizeKey(k));
      }
    }
  };
  walk(raw, "");
  return lines.join("\n");
}

/** Small animated "equaliser" shown while dictation is actively listening. */
function SpeechWaveform() {
  return (
    <span className="inline-flex h-4 items-end gap-0.5" aria-hidden="true">
      {[6, 10, 14, 10, 6].map((h, i) => (
        <span
          key={i}
          className="inline-block w-1 rounded-full bg-current animate-bounce"
          style={{ height: `${h}px`, animationDelay: `${i * 0.12}s`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}

type ChecklistItem = { id: string; text: string; done: boolean };

type NoteHistoryEntry = { id: string; createdAt: string; text: string };

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

/** Formats an ISO timestamp as a short, local date/time for the notes history list. */
function formatHistoryDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function newChecklistId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** A single area's notes as a tappable checklist, iOS Reminders-style: existing items can be
 *  ticked off (struck through) or removed, and a trailing input + "+" button appends new ones. */
function ChecklistEditor({
  items,
  onChange,
  placeholder,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newChecklistId(), text, done: false }]);
    setDraft("");
  };

  const toggle = (id: string) => {
    onChange(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  };

  const remove = (id: string) => {
    onChange(items.filter((it) => it.id !== id));
  };

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id} className="group flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggle(item.id)}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
              item.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
            )}
            aria-label={item.done ? "Mark as not done" : "Mark as done"}
          >
            {item.done && <Check className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => toggle(item.id)}
            className={cn(
              "flex-1 break-words text-left text-sm",
              item.done && "text-muted-foreground line-through",
            )}
          >
            {item.text}
          </button>
          <button
            type="button"
            onClick={() => remove(item.id)}
            className="hidden shrink-0 rounded-sm p-0.5 text-muted-foreground group-hover:block"
            aria-label="Remove item"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={addItem} aria-label="Add item">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** On-site capture for a property viewing: a free-form general notes box plus a tappable
 *  checklist per area (kitchen, bedrooms, garden, roof, etc.) with an optional photo per area,
 *  and a single "Analyse with AI" pass that reads everything written and maps it onto the fixed
 *  survey-issue taxonomy with a severity. The result feeds straight into `survey_findings`
 *  (negotiation leverage / talking points) and into the refurb estimator's matching line items. */
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

  const [generalNote, setGeneralNote] = useState<string>(() => {
    const existing = (property.viewing_notes as any)?.general;
    if (typeof existing === "string" && existing) return existing;
    return formatUserInputs(property.pf_json?.userInputs);
  });
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>(() => {
    const raw = (property.viewing_notes as any) ?? {};
    const result: Record<string, ChecklistItem[]> = {};
    for (const area of areas) {
      const v = raw[area.key];
      if (Array.isArray(v)) {
        result[area.key] = v;
      } else if (typeof v === "string" && v.trim()) {
        result[area.key] = [{ id: newChecklistId(), text: v.trim(), done: false }];
      } else {
        result[area.key] = [];
      }
    }
    return result;
  });
  const [noteHistory, setNoteHistory] = useState<NoteHistoryEntry[]>(() => {
    const raw = property.viewing_note_history;
    return Array.isArray(raw) ? raw : [];
  });
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryText, setEditingHistoryText] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recogRef = useRef<any>(null);
  const lastFinalIndexRef = useRef(0);
  const pendingNotesRef = useRef<Record<string, any> | null>(null);
  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const libraryRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const photos = useQuery({
    queryKey: ["photos", property.id],
    queryFn: () => listPhotosFn({ data: { propertyId: property.id } }),
  });

  const saveNotesMut = useMutation({
    mutationFn: (next: Record<string, any>) =>
      update({ data: { id: property.id, patch: { viewing_notes: next as any } } }),
    onError: (e: any) => toast.error(`Couldn't save notes: ${e.message}`),
  });

  const saveHistoryMut = useMutation({
    mutationFn: (next: NoteHistoryEntry[]) =>
      update({ data: { id: property.id, patch: { viewing_note_history: next as any } } }),
    onError: (e: any) => toast.error(`Couldn't save notes history: ${e.message}`),
  });

  const persistHistory = (next: NoteHistoryEntry[]) => {
    setNoteHistory(next);
    saveHistoryMut.mutate(next);
  };

  const setChecklistForArea = (key: string, items: ChecklistItem[]) => {
    setChecklists((prev) => ({ ...prev, [key]: items }));
  };

  /** Builds a single text snapshot of everything currently written, for the "Analyse with AI"
   *  history and as the payload sent to the AI. */
  const buildNotesSnapshot = (): string => {
    const parts: string[] = [];
    if (generalNote.trim()) parts.push(`General:\n${generalNote.trim()}`);
    for (const area of areas) {
      const items = checklists[area.key] ?? [];
      if (items.length) {
        parts.push(`${area.label}:\n${items.map((it) => `${it.done ? "[done] " : ""}${it.text}`).join("\n")}`);
      }
    }
    return parts.join("\n\n");
  };

  // Debounced autosave of notes — flushes any pending save on unmount so navigating away
  // (e.g. tapping "Back to property") right after typing doesn't lose the edit.
  useEffect(() => {
    const payload: Record<string, any> = { general: generalNote };
    for (const area of areas) payload[area.key] = checklists[area.key] ?? [];
    pendingNotesRef.current = payload;
    const t = setTimeout(() => {
      saveNotesMut.mutate(payload);
      pendingNotesRef.current = null;
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generalNote, checklists]);

  useEffect(() => {
    return () => {
      if (pendingNotesRef.current) saveNotesMut.mutate(pendingNotesRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      try {
        recogRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const stopListening = () => {
    try {
      recogRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
    setInterimText("");
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
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
    recog.interimResults = true;
    lastFinalIndexRef.current = 0;
    setInterimText("");
    recog.onresult = (e: any) => {
      let finalChunk = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          if (i >= lastFinalIndexRef.current) {
            finalChunk += result[0].transcript;
            lastFinalIndexRef.current = i + 1;
          }
        } else {
          interim += result[0].transcript;
        }
      }
      if (finalChunk.trim()) {
        const polished = polishTranscript(finalChunk);
        setGeneralNote((prev) => {
          const sep = prev && !/[\s\n]$/.test(prev) ? " " : "";
          return `${prev}${sep}${polished}`;
        });
      }
      setInterimText(interim);
    };
    recog.onerror = (e: any) => {
      if (e?.error !== "no-speech" && e?.error !== "aborted") {
        toast.error("Dictation error — please try again");
      }
    };
    recog.onend = () => {
      setListening(false);
      setInterimText("");
    };
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

  const restoreHistoryEntry = (entry: NoteHistoryEntry) => {
    setGeneralNote(entry.text);
    toast.success("Restored into General notes");
  };

  const deleteHistoryEntry = (id: string) => {
    persistHistory(noteHistory.filter((e) => e.id !== id));
  };

  const startEditHistoryEntry = (entry: NoteHistoryEntry) => {
    setEditingHistoryId(entry.id);
    setEditingHistoryText(entry.text);
  };

  const saveEditedHistoryEntry = () => {
    persistHistory(noteHistory.map((e) => (e.id === editingHistoryId ? { ...e, text: editingHistoryText } : e)));
    setEditingHistoryId(null);
    setEditingHistoryText("");
  };

  const removePhoto = async (id: string) => {
    await deletePhotoFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["photos", property.id] });
  };

  const runAnalysis = async () => {
    if (listening) stopListening();
    setAnalysing(true);
    try {
      const notes: Record<string, string> = { general: generalNote };
      for (const area of areas) {
        const items = checklists[area.key] ?? [];
        if (items.length) {
          notes[area.key] = items.map((it) => `${it.done ? "[done] " : ""}${it.text}`).join("\n");
        }
      }
      const snapshot = buildNotesSnapshot();
      if (snapshot) {
        const entry: NoteHistoryEntry = { id: newChecklistId(), createdAt: new Date().toISOString(), text: snapshot };
        persistHistory([entry, ...noteHistory].slice(0, 50));
      }
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
        <p className="mb-1.5 text-sm font-medium">General notes</p>
        <Textarea
          placeholder="Anything overall — first impressions, smells, noise, neighbours, anything that doesn't fit a specific room…"
          value={listening && interimText ? `${generalNote}${/[\s\n]$|^$/.test(generalNote) ? "" : " "}${interimText}` : generalNote}
          onChange={(e) => setGeneralNote(e.target.value)}
          className="min-h-[80px] text-sm"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            size="sm"
            variant={listening ? "default" : "outline"}
            onClick={toggleListening}
            className="w-full sm:w-auto"
          >
            {listening ? <MicOff className="mr-1.5 h-4 w-4" /> : <Mic className="mr-1.5 h-4 w-4" />}
            {listening ? (
              <span className="flex items-center gap-1.5">
                Listening… <SpeechWaveform />
              </span>
            ) : (
              "Dictate"
            )}
          </Button>
          <Button type="button" size="sm" disabled={analysing} onClick={runAnalysis} className="w-full sm:w-auto">
            {analysing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Analyse with AI
          </Button>
        </div>
      </div>

      {areas.map((area) => {
        const areaPhotos = (photos.data ?? []).filter((ph: any) => ph.issue_key === area.key);
        return (
          <div key={area.key} className="rounded-md border p-3">
            <p className="mb-1.5 font-medium">{area.label}</p>
            <ChecklistEditor
              items={checklists[area.key] ?? []}
              onChange={(items) => setChecklistForArea(area.key, items)}
              placeholder={`Add a note for ${area.label.toLowerCase()}…`}
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

            <div className="mt-2 grid grid-cols-2 gap-2">
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
                variant="secondary"
                className="w-full"
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
                variant="secondary"
                className="w-full"
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

      {noteHistory.length > 0 && (
        <div className="rounded-md border p-3">
          <p className="mb-1.5 flex items-center gap-1.5 font-medium">
            <History className="h-4 w-4" /> Notes history
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            A snapshot is saved each time you run "Analyse with AI". Restore brings it back into
            General notes so you can edit and re-analyse.
          </p>
          <div className="space-y-2">
            {noteHistory.map((entry) => (
              <div key={entry.id} className="rounded-md border bg-muted/30 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{formatHistoryDate(entry.createdAt)}</span>
                  {editingHistoryId !== entry.id && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => restoreHistoryEntry(entry)}
                        aria-label="Restore into General notes"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEditHistoryEntry(entry)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => deleteHistoryEntry(entry.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {editingHistoryId === entry.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingHistoryText}
                      onChange={(e) => setEditingHistoryText(e.target.value)}
                      className="min-h-[80px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={saveEditedHistoryEntry}>
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingHistoryId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
