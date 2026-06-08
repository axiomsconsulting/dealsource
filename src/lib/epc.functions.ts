import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// UK government's Open Data Communities EPC register — the authoritative source for lodged
// Energy Performance Certificates (England & Wales). Auth is HTTP Basic with the email the API
// account was registered under, plus the API key. Configure EPC_API_EMAIL / EPC_API_KEY as
// server-side secrets (same place as LOVABLE_API_KEY/FIRECRAWL_API_KEY) — never in the repo .env,
// since that file is committed and only meant for public/publishable values.
const EPC_BASE = "https://epc.opendatacommunities.org/api/v1/domestic";

function authHeader(): string | null {
  const email = process.env.EPC_API_EMAIL;
  const key = process.env.EPC_API_KEY;
  if (!email || !key) return null;
  return "Basic " + Buffer.from(`${email}:${key}`).toString("base64");
}

async function epcFetch(path: string): Promise<any> {
  const auth = authHeader();
  if (!auth) throw new Error("EPC_API_EMAIL / EPC_API_KEY are not configured on the server");
  const res = await fetch(`${EPC_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: auth },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`EPC register request failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
  return res.json();
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

const ELEMENT_FIELDS: { key: string; label: string; descKey: string; effKey: string }[] = [
  { key: "walls", label: "Walls", descKey: "walls-description", effKey: "walls-energy-eff" },
  { key: "roof", label: "Roof", descKey: "roof-description", effKey: "roof-energy-eff" },
  { key: "floor", label: "Floor", descKey: "floor-description", effKey: "floor-energy-eff" },
  { key: "windows", label: "Windows", descKey: "windows-description", effKey: "windows-energy-eff" },
  { key: "mainheat", label: "Main heating", descKey: "mainheat-description", effKey: "mainheat-energy-eff" },
  { key: "mainheatcont", label: "Heating controls", descKey: "mainheatcont-description", effKey: "mainheatcont-energy-eff" },
  { key: "hotwater", label: "Hot water", descKey: "hotwater-description", effKey: "hot-water-energy-eff" },
  { key: "lighting", label: "Lighting", descKey: "lighting-description", effKey: "lighting-energy-eff" },
  { key: "secondheat", label: "Secondary heating", descKey: "secondheat-description", effKey: "" },
];

const EFF_RANK: Record<string, number> = { "very poor": 1, poor: 2, average: 3, good: 4, "very good": 5 };

function parseCostRange(raw: string | null | undefined): { min: number | null; max: number | null; raw: string } {
  const text = (raw ?? "").trim();
  const nums = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return { min: null, max: null, raw: text || "Cost not provided" };
  const vals = nums.map(Number);
  return { min: Math.min(...vals), max: Math.max(...vals), raw: text };
}

function normaliseAddress(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Scores how well an EPC search row's address matches the property's stored address —
 *  token-overlap so "12 High Street" matches "Flat 2, 12 High Street, Townsville". */
function addressMatchScore(propertyAddress: string, row: any): number {
  const rowAddr = normaliseAddress([row["address1"], row["address2"], row["address3"]].filter(Boolean).join(" "));
  const a = new Set(normaliseAddress(propertyAddress).split(" ").filter((t) => t.length > 1));
  const b = new Set(rowAddr.split(" ").filter((t) => t.length > 1));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return overlap / a.size;
}

function buildEpcData(cert: any, recRows: any[]): any {
  const currentScore = cert["current-energy-efficiency"] != null ? Number(cert["current-energy-efficiency"]) : null;
  const potentialScore = cert["potential-energy-efficiency"] != null ? Number(cert["potential-energy-efficiency"]) : null;
  const elements = ELEMENT_FIELDS
    .map((f) => {
      const description = cert[f.descKey] ?? null;
      const energyEff: string | null = f.effKey ? (cert[f.effKey] ?? null) : null;
      if (!description && !energyEff) return null;
      return {
        key: f.key,
        label: f.label,
        description,
        energyEff,
        rank: energyEff ? (EFF_RANK[energyEff.toLowerCase()] ?? null) : null,
      };
    })
    .filter(Boolean);

  const recommendations = (recRows ?? [])
    .map((r: any) => {
      const cost = parseCostRange(r["indicative-cost"]);
      return {
        id: r["improvement-id"] ?? null,
        summary: r["improvement-summary-text"] ?? r["improvement-id-text"] ?? "Improvement",
        description: r["improvement-descr-text"] ?? null,
        costMin: cost.min,
        costMax: cost.max,
        costLabel: cost.raw,
      };
    })
    // Cheapest justified spend first — directly serves "prioritise minimum spend to stack gains".
    // Items with no costed figure (rare — usually structural/major works) sort to the end.
    .sort((a, b) => {
      const av = a.costMin ?? Infinity, bv = b.costMin ?? Infinity;
      return av - bv;
    });

  return {
    lmkKey: cert["lmk-key"] ?? null,
    address: [cert["address1"], cert["address2"], cert["address3"]].filter(Boolean).join(", ") || null,
    postcode: cert["postcode"] ?? null,
    lodgementDate: cert["lodgement-date"] ?? null,
    inspectionDate: cert["inspection-date"] ?? null,
    propertyType: cert["property-type"] ?? null,
    builtForm: cert["built-form"] ?? null,
    totalFloorArea: cert["total-floor-area"] != null ? Number(cert["total-floor-area"]) : null,
    currentRating: cert["current-energy-rating"] ?? bandForScore(currentScore),
    currentScore,
    potentialRating: cert["potential-energy-rating"] ?? bandForScore(potentialScore),
    potentialScore,
    co2Current: cert["co2-emissions-current"] != null ? Number(cert["co2-emissions-current"]) : null,
    co2Potential: cert["co2-emiss-curr-per-floor-area"] != null ? Number(cert["co2-emiss-curr-per-floor-area"]) : null,
    elements,
    recommendations,
  };
}

export const fetchEpcForProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prop, error: propErr } = await context.supabase
      .from("properties").select("id, address, postcode, epc_data, epc_fetched_at")
      .eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (propErr) throw new Error(propErr.message);
    if (!prop) throw new Error("Property not found");
    if (!prop.postcode) throw new Error("This property has no postcode on file — the EPC register is searched by postcode");

    const search = await epcFetch(`/search?postcode=${encodeURIComponent(prop.postcode)}&size=50`);
    const rows: any[] = search?.rows ?? [];
    if (!rows.length) throw new Error(`No EPC certificates found on the register for postcode ${prop.postcode}`);

    // Best address match first; fall back to the most recently lodged certificate for the postcode.
    const scored = rows
      .map((r) => ({ row: r, score: addressMatchScore(prop.address ?? "", r) }))
      .sort((a, b) => (b.score - a.score) || (String(b.row["lodgement-date"] ?? "").localeCompare(String(a.row["lodgement-date"] ?? ""))));
    const chosen = scored[0];
    if (!chosen?.row?.["lmk-key"]) throw new Error("EPC register returned no usable certificate reference for this postcode");
    const matchedByAddress = chosen.score >= 0.5;

    const lmkKey = chosen.row["lmk-key"];
    const [certRes, recRes] = await Promise.all([
      epcFetch(`/certificate/${encodeURIComponent(lmkKey)}`),
      epcFetch(`/recommendations/${encodeURIComponent(lmkKey)}`),
    ]);
    const cert = certRes?.rows?.[0];
    if (!cert) throw new Error("EPC register did not return certificate detail for the matched property");

    const epc_data = { ...buildEpcData(cert, recRes?.rows ?? []), matchedByAddress };
    const epc_fetched_at = new Date().toISOString();
    const { error: updErr } = await context.supabase
      .from("properties").update({ epc_data, epc_fetched_at }).eq("id", data.propertyId).eq("user_id", context.userId);
    if (updErr) throw new Error(updErr.message);

    return { epc_data, epc_fetched_at };
  });

export const getEpcForProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("properties").select("epc_data, epc_fetched_at")
      .eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? { epc_data: null, epc_fetched_at: null };
  });
