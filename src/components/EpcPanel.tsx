import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, KeyRound, RefreshCw, Save, Sparkles } from "lucide-react";
import {
  fetchEpcForProperty, selectEpcCertificate, getEpcForProperty, getEpcCredentialsStatus, saveEpcCredentials, clearEpcCredentials,
  EPC_BANDS, bandForScore,
} from "@/lib/epc.functions";
import { buildEpcRoadmap, buildEpcMeasureCandidates, resolveEpcMeasureSelection, deriveAiEpcCategories } from "@/lib/analysis/epc-plan";
import { updateProperty } from "@/lib/ingest.functions";
import { fmtGBP } from "@/lib/format";
import { toast } from "sonner";

// Certificates fetched before the bilingual-description fix may still have `description` cached
// as `{ value, language }` (Welsh certificates shape it that way) — coerce defensively so a stale
// row can't crash the page; React refuses to render a bare object as a child.
function descriptionText(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && typeof (raw as any).value === "string") return (raw as any).value;
  return null;
}

const EFF_LABEL_COLOR: Record<string, string> = {
  "very good": "text-emerald-700 bg-emerald-50 border-emerald-200",
  good: "text-green-700 bg-green-50 border-green-200",
  average: "text-amber-700 bg-amber-50 border-amber-200",
  poor: "text-orange-700 bg-orange-50 border-orange-200",
  "very poor": "text-red-700 bg-red-50 border-red-200",
};

export function EpcPanel({ propertyId, property }: { propertyId: string; property?: any }) {
  const qc = useQueryClient();
  const getEpc = useServerFn(getEpcForProperty);
  const fetchEpc = useServerFn(fetchEpcForProperty);
  const selectCert = useServerFn(selectEpcCertificate);
  const updateProp = useServerFn(updateProperty);

  const q = useQuery({ queryKey: ["epc", propertyId], queryFn: () => getEpc({ data: { propertyId } }) });
  const epc: any = (q.data as any)?.epc_data ?? null;
  const fetchedAt: string | null = (q.data as any)?.epc_fetched_at ?? null;

  const getCredsStatus = useServerFn(getEpcCredentialsStatus);
  const credQ = useQuery({ queryKey: ["epc-credentials"], queryFn: () => getCredsStatus({ data: {} } as any) });
  const configured = !!(credQ.data as any)?.configured;

  // A wrong auto-match is worse than no match — it puts another property's certificate in front
  // of the user as if it were theirs. So `fetchEpcForProperty` only auto-applies an exact address
  // match; anything else comes back as a "candidates" pick-list for a one-click human confirmation
  // via `selectEpcCertificate`, and nothing is written until the user picks.
  const [candidates, setCandidates] = useState<any[] | null>(null);
  const [searchedPostcode, setSearchedPostcode] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => fetchEpc({ data: { propertyId } }),
    onSuccess: (r: any) => {
      if (r.status === "matched") {
        toast.success("EPC certificate matched and fetched from the register");
        setCandidates(null);
        qc.invalidateQueries({ queryKey: ["epc", propertyId] });
      } else if (r.status === "ambiguous") {
        setCandidates(r.candidates);
        setSearchedPostcode(r.searchedPostcode);
        toast.message("Couldn't confirm a single exact address match — pick the right certificate below");
      } else {
        setCandidates(null);
        toast.error(`No EPC certificates found on the register for postcode ${r.searchedPostcode}`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectMut = useMutation({
    mutationFn: (certificateNumber: string) => selectCert({ data: { propertyId, certificateNumber } }),
    onSuccess: () => {
      toast.success("Certificate saved to this property");
      setCandidates(null);
      qc.invalidateQueries({ queryKey: ["epc", propertyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const roadmap = useMemo(() => epc ? buildEpcRoadmap(epc) : null, [epc]);

  const aiCategories = useMemo(() => deriveAiEpcCategories(property?.ai_payload), [property?.ai_payload]);
  const epcMeasureCandidates = useMemo(() => roadmap ? buildEpcMeasureCandidates(roadmap, aiCategories) : [], [roadmap, aiCategories]);
  const [overrides, setOverrides] = useState<Record<number, boolean>>(() => property?.refurb_estimate?.epcMeasures ?? {});
  useEffect(() => { setOverrides(property?.refurb_estimate?.epcMeasures ?? {}); }, [property?.refurb_estimate?.epcMeasures]);
  const { selected, totals } = useMemo(() => resolveEpcMeasureSelection(epcMeasureCandidates, overrides), [epcMeasureCandidates, overrides]);

  const saveSelectionMut = useMutation({
    mutationFn: () => updateProp({ data: { id: propertyId, patch: { refurb_estimate: { ...(property?.refurb_estimate ?? {}), epcMeasures: overrides } as any } } }),
    onSuccess: () => { toast.success("EPC measure selection saved — applied to Refurb Estimator"); qc.invalidateQueries({ queryKey: ["property", propertyId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {epc?.source === "pf_json"
            ? <>Band and SAP score from the listing JSON — fetching from the register adds the full element-by-element breakdown, assessor-costed improvement roadmap, and official certificate link.</>
            : epc
              ? <>From the government EPC register — matched on the exact registered address{epc.matchedManually ? " (you confirmed this one)" : ""}{fetchedAt ? ` · cached ${new Date(fetchedAt).toLocaleDateString("en-GB")}` : ""}</>
              : "Pulls the lodged certificate, full element-by-element breakdown and the assessor's costed improvement recommendations straight from the register."}
        </p>
        {credQ.isSuccess && configured && (
          <Button size="sm" variant={epc ? "outline" : "default"} disabled={mut.isPending} onClick={() => { setCandidates(null); mut.mutate(); }}>
            <RefreshCw className={`mr-1 h-3 w-3 ${mut.isPending ? "animate-spin" : ""}`} />
            {epc?.source === "pf_json" ? "Enrich from EPC register" : epc ? "Refetch from register" : "Fetch from EPC register"}
          </Button>
        )}
      </div>
      <div className={epc || candidates ? "border-b pb-6" : undefined}>
        <EpcCredentialsForm />
      </div>
      {candidates && (
        <div className="border-b pb-6">
          <h4 className="mb-1 text-sm font-semibold">Which of these is this property?</h4>
          <p className="mb-3 text-xs text-muted-foreground">
            The register doesn't have an exact address match for postcode {searchedPostcode} — rather than guess (and risk showing you
            another property's certificate), pick the correct one below. Nothing is saved until you choose.
          </p>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No certificates found for this postcode.</p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li key={c.certificateNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{c.address}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.band ? `Band ${c.band} · ` : ""}lodged {c.lodgementDate ? new Date(c.lodgementDate).toLocaleDateString("en-GB") : "unknown date"} · cert {c.certificateNumber}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={selectMut.isPending} onClick={() => selectMut.mutate(c.certificateNumber)}>
                    Use this certificate
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {epc && (
        <div className="space-y-6">
          {epc.address && (
            <p className="text-xs text-muted-foreground">
              Matched certificate: {epc.address} · lodged {epc.lodgementDate ? new Date(epc.lodgementDate).toLocaleDateString("en-GB") : "unknown date"}
            </p>
          )}

          <EpcChart currentScore={epc.currentScore} currentBand={epc.currentRating} potentialScore={epc.potentialScore} potentialBand={epc.potentialRating} />

          {epc.elements?.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">What the assessment found</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {epc.elements.map((el: any) => (
                  <div key={el.key} className="rounded-md border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium">{el.label}</span>
                      {el.energyEff && (
                        <Badge variant="outline" className={`text-[10px] ${EFF_LABEL_COLOR[el.energyEff.toLowerCase()] ?? ""}`}>{el.energyEff}</Badge>
                      )}
                    </div>
                    {descriptionText(el.description) && <p className="text-xs text-muted-foreground">{descriptionText(el.description)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {roadmap && (
            <div>
              <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-orange-500" /> Improvement roadmap — assessor's order, cheapest first</h4>
              <p className="mb-3 text-xs text-muted-foreground">
                {epc.currentRating}{epc.currentScore != null ? ` (${epc.currentScore})` : ""} → {epc.potentialRating}{epc.potentialScore != null ? ` (${epc.potentialScore})` : ""} is what the assessor says is achievable doing every measure below, for a total indicative spend of {fmtGBP(roadmap.totalCostMin)}–{fmtGBP(roadmap.totalCostMax)}.
                {" "}The resulting score after each step is the register's own calculated cumulative figure — not an estimate — so the "reaches D" / "reaches C" markers below are read straight off the certificate.
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Tick the upgrades you want costed in — these feed the Refurb Estimator and the EPC negotiation point.
                Items flagged from the AI photo condition scan are pre-ticked; untick anything you disagree with.
              </p>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                <span>
                  Selected: <span className="font-semibold">{totals.count}</span> of {epcMeasureCandidates.length} measures · est.{" "}
                  <span className="font-semibold">{fmtGBP(totals.low)}–{fmtGBP(totals.high)}</span> (mid {fmtGBP(totals.mid)})
                </span>
                <Button size="sm" variant="outline" disabled={saveSelectionMut.isPending} onClick={() => saveSelectionMut.mutate()}>
                  <Save className="mr-1 h-3 w-3" /> Save selection
                </Button>
              </div>
              <ol className="space-y-2">
                {epcMeasureCandidates.map((c) => {
                  const isSelected = selected.some((sel) => sel.index === c.index);
                  return (
                    <li key={c.index} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-1 items-start gap-2">
                          <Checkbox
                            className="mt-0.5"
                            checked={isSelected}
                            onCheckedChange={(checked) => setOverrides((prev) => ({ ...prev, [c.index]: !!checked }))}
                          />
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{c.title}</span>
                              {c.crossesIntoC && <Badge className="bg-green-600 text-[10px] text-white">reaches C here</Badge>}
                              {c.aiRecommended && (
                                <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[10px] text-sky-700">
                                  <Sparkles className="mr-1 h-3 w-3" /> AI flagged
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {c.resultingScore != null && <>Resulting score after this step: {c.resultingScore}{c.resultingBand ? ` (band ${c.resultingBand})` : ""}</>}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold">{fmtGBP(c.costMin ?? 0)}–{fmtGBP(c.costMax ?? c.costMin ?? 0)}</div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {epc.certificateUrl && (
                <a href={epc.certificateUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-accent underline">
                  View the official certificate on the government register ↗
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The classic EPC certificate "ladder" — colour bands A–G with markers for the current and
 *  potential SAP scores, drawn to scale (1–100) so the gap between them reads at a glance. */
function EpcChart({ currentScore, currentBand, potentialScore, potentialBand }: {
  currentScore: number | null; currentBand: string | null; potentialScore: number | null; potentialBand: string | null;
}) {
  const pct = (score: number) => Math.min(100, Math.max(0, score));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
        <RatingChip label="Current" band={currentBand} score={currentScore} />
        <RatingChip label="Potential" band={potentialBand} score={potentialScore} />
      </div>
      <div className="relative h-10 overflow-hidden rounded-md border">
        <div className="flex h-full w-full">
          {EPC_BANDS.slice().reverse().map((b) => (
            <div key={b.band} className="relative flex h-full items-center justify-end pr-1.5 text-[11px] font-bold text-white"
              style={{ width: `${b.max - b.min + 1}%`, backgroundColor: b.color }}>
              {b.band}
            </div>
          ))}
        </div>
        {currentScore != null && (
          <Marker pct={pct(currentScore)} label={`Current ${currentScore}`} className="border-slate-900" />
        )}
        {potentialScore != null && potentialScore !== currentScore && (
          <Marker pct={pct(potentialScore)} label={`Potential ${potentialScore}`} className="border-slate-500 border-dashed" />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>1 (lowest efficiency)</span>
        <span>100 (highest efficiency)</span>
      </div>
    </div>
  );
}

function Marker({ pct, label, className }: { pct: number; label: string; className?: string }) {
  return (
    <div className="absolute top-0 h-full" style={{ left: `${pct}%` }} title={label}>
      <div className={`h-full w-0 border-l-2 ${className}`} />
    </div>
  );
}

function RatingChip({ label, band, score }: { label: string; band: string | null; score: number | null }) {
  const b = EPC_BANDS.find((x) => x.band === (band ?? bandForScore(score)));
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex h-7 w-7 items-center justify-center rounded font-bold text-white" style={{ backgroundColor: b?.color ?? "#999" }}>
        {band ?? "?"}
      </span>
      {score != null && <span className="text-xs text-muted-foreground">({score}/100)</span>}
    </div>
  );
}

/** Each user brings their own free GOV.UK "Get energy performance of buildings data" account and
 *  signs in with GOV.UK One Login to generate a personal bearer token — saved to *their* profile
 *  row only (RLS-scoped), never a shared platform secret, so nobody else's token ever touches this
 *  app's config. The token is write-only from the browser's perspective: once saved we only ever
 *  ask the server "is one configured?", never read it back. */
function EpcCredentialsForm() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getEpcCredentialsStatus);
  const save = useServerFn(saveEpcCredentials);
  const clear = useServerFn(clearEpcCredentials);

  const q = useQuery({ queryKey: ["epc-credentials"], queryFn: () => getStatus({ data: {} } as any) });
  const status: any = q.data;
  const configured = !!status?.configured;

  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => { if (!configured) setEditing(true); }, [configured]);

  const saveMut = useMutation({
    mutationFn: () => save({ data: { token } }),
    onSuccess: () => {
      toast.success("EPC register token saved to your account");
      setToken(""); setEditing(false);
      qc.invalidateQueries({ queryKey: ["epc-credentials"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const clearMut = useMutation({
    mutationFn: () => clear({ data: {} } as any),
    onSuccess: () => {
      toast.success("EPC register token removed");
      setToken(""); setEditing(true);
      qc.invalidateQueries({ queryKey: ["epc-credentials"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading) return null;

  if (configured && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <KeyRound className="h-4 w-4 text-emerald-600" />
          EPC register connected — your bearer token is saved to your account and used only for your fetches.
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Replace token</Button>
          <Button size="sm" variant="ghost" disabled={clearMut.isPending} onClick={() => { if (confirm("Remove your saved EPC register token?")) clearMut.mutate(); }}>Remove</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
        Bring your own free <span className="font-medium text-foreground">"Get energy performance of buildings data"</span> account.
        Sign in with GOV.UK One Login on the register's site and generate a personal access token from your account page,
        then paste it here. It's stored against your account only — gated so only you can read or write it — and is never
        shared with other users or written into this app's source/config.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="epc-token">Bearer token</Label>
        <Input id="epc-token" type="password" placeholder={configured ? "Enter new token to replace the saved one" : "Paste your EPC register access token"} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={!token || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? "Saving…" : "Save token"}
        </Button>
        {configured && <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setToken(""); }}>Cancel</Button>}
      </div>
    </div>
  );
}
