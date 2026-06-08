import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// MHCLG's "Get energy performance of buildings data" service — the successor to the old
// opendatacommunities.org EPC register (which now 301-redirects here). Auth is a single bearer
// token issued via GOV.UK One Login (found on the user's "my account" page on the service).
// Each user brings their own token — saved to *their* `profiles` row only (RLS: auth.uid() = id),
// never a shared platform secret, never written to the repo.
const EPC_BASE = "https://api.get-energy-performance-data.communities.gov.uk";
// The public-facing certificate viewer — used to (a) link out to the official record and
// (b) read the plain-English title of each "Step N: ..." improvement, since the JSON API only
// returns numeric improvement codes (type/number/category) with no description text.
const CERT_VIEW_BASE = "https://find-energy-certificate.service.gov.uk/energy-certificate";

async function loadUserEpcToken(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("epc_bearer_token").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.epc_bearer_token || null;
}

async function epcFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`${EPC_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("The EPC register rejected your bearer token — it may have expired. Generate a new one from your account on the register and save it again.");

  // Read as text first: a non-JSON 2xx (an HTML error/maintenance/challenge page from the
  // register or a network intermediary) would otherwise surface as the cryptic
  // "Unexpected token '<', \"<!DOCTYPE\"... is not valid JSON" with no clue what happened.
  const raw = await res.text();
  let body: any;
  try { body = JSON.parse(raw); }
  catch {
    const looksHtml = /^\s*<(!doctype|html)/i.test(raw);
    throw new Error(
      looksHtml
        ? `The EPC register returned a web page instead of data (HTTP ${res.status}). This usually means the request couldn't reach the register from this server, or your token has expired.`
        : `The EPC register returned an unreadable response (HTTP ${res.status}): ${raw.slice(0, 300)}`
    );
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(body?.data?.error || body?.error || `EPC register request failed (${res.status})`);
  return body;
}

/** Best-effort scrape of the public certificate page for the plain-English title of each
 *  recommended improvement step ("Step 1: High heat retention storage heaters and dual rate
 *  meter") — the JSON API only exposes numeric codes for these. Returns an empty map on any
 *  failure; titles are a nicety, not load-bearing for the cost/score data. */
async function fetchStepTitles(certificateNumber: string): Promise<Map<number, string>> {
  const titles = new Map<number, string>();
  try {
    const res = await fetch(`${CERT_VIEW_BASE}/${encodeURIComponent(certificateNumber)}`, { headers: { Accept: "text/html" } });
    if (!res.ok) return titles;
    const html = await res.text();
    for (const m of html.matchAll(/<h3[^>]*class="govuk-heading-m"[^>]*>\s*Step (\d+):\s*([^<]+?)\s*<\/h3>/gi)) {
      titles.set(Number(m[1]), m[2].trim());
    }
  } catch { /* best-effort */ }
  return titles;
}

// EPC band thresholds (current/potential energy efficiency, SAP points 1-100).
export const EPC_BANDS = [
  { band: "A", min: 92, max: 100, color: "#0c8040" },
  { band: "B", min: 81, max: 91, color: "#33a457" },
  { band: "C", min: 69, max: 80, color: "#8dc63f" },
  { band: "D", min: 55, max: 68, color: "#f5d033" },
  { band: "E", min: 39, max: 54, color: "#f0a23c" },
  { band: "F", min: 21, max: 38, color: "#ed6e35" },
  { band: "G", min: 1, max: 20, color: "#e31f26" },
] as const;

export function bandForScore(score: number | null | undefined): string | null {
  if (score == null) return null;
  const b = EPC_BANDS.find((b) => score >= b.min && score <= b.max);
  return b?.band ?? null;
}

// The standard RdSAP element rating scale used throughout the new schema (0 = not
// applicable/not assessed, 1-5 = Very poor..Very good) — a small, stable enum, unlike the
// open-ended improvement-measure code list which we deliberately don't try to translate.
const ELEMENT_RATING_LABEL: Record<number, string> = { 0: "n/a", 1: "very poor", 2: "poor", 3: "average", 4: "good", 5: "very good" };

type ElementShape = { description?: string | null; energy_efficiency_rating?: number | null };

const ELEMENT_FIELDS: { key: string; label: string }[] = [
  { key: "walls", label: "Walls" },
  { key: "roofs", label: "Roof" },
  { key: "floors", label: "Floor" },
  { key: "window", label: "Windows" },
  { key: "main_heating", label: "Main heating" },
  { key: "main_heating_controls", label: "Heating controls" },
  { key: "hot_water", label: "Hot water" },
  { key: "lighting", label: "Lighting" },
  { key: "secondary_heating", label: "Secondary heating" },
  { key: "air_tightness", label: "Air tightness" },
];

function normaliseElement(raw: any): ElementShape | null {
  if (!raw) return null;
  // walls/roofs/floors are arrays of building parts; the rest are single objects.
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  return item;
}

function parseCostRange(raw: string | null | undefined): { min: number | null; max: number | null; raw: string } {
  const text = (raw ?? "").trim();
  const nums = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return { min: null, max: null, raw: text || "Cost not provided" };
  const vals = nums.map(Number);
  return { min: Math.min(...vals), max: Math.max(...vals), raw: text.startsWith("£") ? text : `£${text}` };
}

function normaliseAddress(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function joinRowAddress(row: any): string {
  return [row.addressLine1, row.addressLine2, row.addressLine3, row.addressLine4].filter(Boolean).join(", ");
}

/** The first standalone number (house/flat/unit number, optionally suffixed "27a") in an address —
 *  the single most important disambiguator between neighbouring or stacked properties ("27
 *  Flaxlands Court" vs "1 Flaxlands Court" share every other word but are different dwellings). */
function extractUnitNumber(normalisedAddr: string): string | null {
  const m = normalisedAddr.match(/\b(\d+[a-z]?)\b/);
  return m ? m[1] : null;
}

/** Address match scoring tuned to make a *wrong* match structurally impossible to rank as
 *  confident: the leading unit/house number must match exactly (it's the one token that
 *  distinguishes "27 Flaxlands Court" from "1 Flaxlands Court"), and a normalised exact string
 *  match is the only thing that can be auto-applied without the user confirming. Anything short
 *  of that is surfaced as a pick-list — never silently substituted. */
function scoreAddressMatch(propertyAddress: string, row: any): { score: number; exact: boolean; numberMatch: boolean; rowAddr: string } {
  const rowAddr = joinRowAddress(row);
  const normP = normaliseAddress(propertyAddress);
  const normR = normaliseAddress(rowAddr);
  const exact = !!normP && normP === normR;

  const numP = extractUnitNumber(normP);
  const numR = extractUnitNumber(normR);
  const numberMatch = numP != null && numP === numR;

  const tokensP = new Set(normP.split(" ").filter((t) => t.length > 1));
  const tokensR = new Set(normR.split(" ").filter((t) => t.length > 1));
  let overlap = 0;
  for (const t of tokensP) if (tokensR.has(t)) overlap++;
  const overlapRatio = tokensP.size ? overlap / tokensP.size : 0;

  return { score: overlapRatio, exact, numberMatch, rowAddr };
}

function buildEpcData(cert: any, certificateNumber: string, stepTitles: Map<number, string>): any {
  const currentScore = cert.energy_rating_current ?? null;
  const potentialScore = cert.energy_rating_potential ?? null;

  const elements = ELEMENT_FIELDS
    .map((f) => {
      const el = normaliseElement(cert[f.key]);
      if (!el || (!el.description && el.energy_efficiency_rating == null)) return null;
      const rank = el.energy_efficiency_rating ?? null;
      return {
        key: f.key,
        label: f.label,
        description: el.description ?? null,
        energyEff: rank != null ? ELEMENT_RATING_LABEL[rank] ?? null : null,
        rank,
      };
    })
    .filter(Boolean);

  // suggested_improvements is already ordered by the assessor (`sequence`) — and crucially each
  // entry's `energy_performance_rating` is the *cumulative* resulting score after completing
  // every step up to and including it (verified against the register's own published certificate
  // pages, e.g. "Potential rating after completing steps 1 and 2: 78"). That means — unlike the
  // old register API, which published no per-measure score contribution at all — we can build an
  // exact, register-grounded "what gets you to D / what gets you to C" roadmap with no guesswork.
  let cumMin = 0, cumMax = 0;
  const recommendations = (cert.suggested_improvements ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((r: any) => {
      const cost = parseCostRange(r.indicative_cost);
      cumMin += cost.min ?? 0;
      cumMax += cost.max ?? cost.min ?? 0;
      const resultingScore = r.energy_performance_rating ?? null;
      return {
        sequence: r.sequence ?? null,
        title: (r.sequence != null && stepTitles.get(r.sequence)) || `Improvement measure ${r.improvement_details?.improvement_number ?? r.improvement_type ?? ""}`.trim(),
        code: { type: r.improvement_type ?? null, number: r.improvement_details?.improvement_number ?? null, category: r.improvement_category ?? null },
        costMin: cost.min,
        costMax: cost.max,
        costLabel: cost.raw,
        typicalSavingPerYear: r.typical_saving?.value ?? null,
        cumulativeCostMin: cumMin,
        cumulativeCostMax: cumMax,
        resultingScore,
        resultingBand: bandForScore(resultingScore),
      };
    });

  return {
    certificateNumber,
    certificateUrl: `${CERT_VIEW_BASE}/${encodeURIComponent(certificateNumber)}`,
    address: [cert.address_line_1, cert.address_line_2, cert.address_line_3, cert.address_line_4].filter(Boolean).join(", ") || null,
    postcode: cert.postcode ?? null,
    lodgementDate: cert.registration_date ?? null,
    inspectionDate: cert.inspection_date ?? null,
    propertyType: cert.dwelling_type ?? null,
    builtForm: cert.built_form ?? null,
    totalFloorArea: cert.total_floor_area != null ? Number(cert.total_floor_area) : null,
    currentRating: cert.current_energy_efficiency_band ?? bandForScore(currentScore),
    currentScore,
    potentialRating: cert.potential_energy_efficiency_band ?? bandForScore(potentialScore),
    potentialScore,
    co2Current: cert.co2_emissions_current ?? null,
    co2Potential: cert.co2_emissions_potential ?? null,
    elements,
    recommendations,
  };
}

async function loadCertificateAndPersist(context: any, propertyId: string, certificateNumber: string, token: string, matchedManually: boolean) {
  const certRes = await epcFetch(`/api/certificate?certificate_number=${encodeURIComponent(certificateNumber)}`, token);
  const cert = certRes?.data;
  if (!cert) throw new Error("EPC register did not return certificate detail for that certificate number");

  const stepTitles = await fetchStepTitles(certificateNumber);
  const epc_data = { ...buildEpcData(cert, certificateNumber, stepTitles), matchedByAddress: true, matchedManually };
  const epc_fetched_at = new Date().toISOString();
  const { error: updErr } = await context.supabase
    .from("properties").update({ epc_data, epc_fetched_at }).eq("id", propertyId).eq("user_id", context.userId);
  if (updErr) throw new Error(updErr.message);
  return { status: "matched" as const, epc_data, epc_fetched_at };
}

// Wrong EPC matches are worse than no match — they put another property's improvement costs,
// scores and recommendations in front of the user as if they were this property's own. So the
// only thing this ever does *without* asking is an exact, normalised string match (for the very
// common single-dwelling-per-postcode case, where it's effectively unambiguous). Anything short
// of that — including the "looks pretty close" matches that caused "27 Flaxlands Court" to be
// silently swapped for "1 Flaxlands Court" — comes back as a pick-list for the user to confirm
// with one click via `selectEpcCertificate`. Nothing is written to the property until then.
export const fetchEpcForProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const token = await loadUserEpcToken(context.supabase, context.userId);
    if (!token) throw new Error("Add your EPC register bearer token below before fetching — it's saved to your account only.");

    const { data: prop, error: propErr } = await context.supabase
      .from("properties").select("id, address, postcode, epc_data, epc_fetched_at")
      .eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (propErr) throw new Error(propErr.message);
    if (!prop) throw new Error("Property not found");
    if (!prop.postcode) throw new Error("This property has no postcode on file — the EPC register is searched by postcode");

    const search = await epcFetch(`/api/domestic/search?postcode=${encodeURIComponent(prop.postcode)}&page_size=100`, token);
    const rows: any[] = search?.data ?? [];
    if (!rows.length) return { status: "not_found" as const, searchedPostcode: prop.postcode };

    const scored = rows
      .map((r) => ({ row: r, ...scoreAddressMatch(prop.address ?? "", r) }))
      .sort((a, b) => (Number(b.exact) - Number(a.exact)) || (Number(b.numberMatch) - Number(a.numberMatch)) || (b.score - a.score)
        || String(b.row.registrationDate ?? "").localeCompare(String(a.row.registrationDate ?? "")));

    const exactMatches = scored.filter((s) => s.exact);
    if (exactMatches.length === 1) {
      return await loadCertificateAndPersist(context, data.propertyId, exactMatches[0].row.certificateNumber, token, false);
    }

    // Either no exact match, or more than one identical address on the register for this postcode
    // (genuinely possible — re-lodged certificates) — surface candidates, best-ranked first, and
    // let the user pick. Capped to a sane review size; the full list is on the register itself.
    const candidates = scored.slice(0, 12).map((s) => ({
      certificateNumber: s.row.certificateNumber as string,
      address: s.rowAddr,
      band: s.row.currentEnergyEfficiencyBand ?? null,
      lodgementDate: s.row.registrationDate ?? null,
      numberMatch: s.numberMatch,
    }));
    return { status: "ambiguous" as const, candidates, searchedPostcode: prop.postcode, propertyAddress: prop.address ?? null };
  });

// One-click confirmation step for the "ambiguous" path above — the user has visually confirmed
// which register entry is actually their property, so we fetch and persist that exact one.
export const selectEpcCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid(), certificateNumber: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const token = await loadUserEpcToken(context.supabase, context.userId);
    if (!token) throw new Error("Add your EPC register bearer token below before fetching — it's saved to your account only.");

    const { data: prop, error: propErr } = await context.supabase
      .from("properties").select("id").eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (propErr) throw new Error(propErr.message);
    if (!prop) throw new Error("Property not found");

    return await loadCertificateAndPersist(context, data.propertyId, data.certificateNumber, token, true);
  });

export const getEpcForProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("properties").select("epc_data, epc_fetched_at")
      .eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? { epc_data: null, epc_fetched_at: null };
  });

// --- Per-user EPC register credentials -------------------------------------------------
// A single bearer token (GOV.UK One Login issues one per account from the register's "my
// account" page), stored on the user's own `profiles` row (RLS: auth.uid() = id) — each user
// brings their own free account. `getEpcCredentialsStatus` deliberately never returns the token
// itself to the client, only whether one is on file, so it isn't echoed back into the browser.

export const getEpcCredentialsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles").select("epc_bearer_token").eq("id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return { configured: !!data?.epc_bearer_token };
  });

export const saveEpcCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ token: z.string().min(10) }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ epc_bearer_token: data.token.trim() })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { configured: true };
  });

export const clearEpcCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ epc_bearer_token: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { configured: false };
  });
