import type { PropertyInput, StrategyKey } from "./types";
import { locationModifier } from "./refurb";

export interface InsuranceFactor {
  label: string;
  /** Multiplicative adjustment, e.g. 0.18 = +18% on the running premium. */
  impactPct: number;
  detail: string;
}

export interface InsuranceEstimate {
  rebuildCostGbp: number;
  rebuildPerSqm: number;
  baseRatePct: number;
  factors: InsuranceFactor[];
  totalMultiplier: number;
  annualPremiumGbp: number;
  monthlyPremiumGbp: number;
  notes: string[];
}

// ABI-style rebuild cost guide rates (£/m²), 2026 averages — what it costs to REBUILD the
// structure from scratch (demolition + materials + labour), which is what buildings insurance
// is sized against, not the market sale value.
const REBUILD_PER_SQM: Record<string, number> = {
  flat: 1450,
  terrace: 1550,
  "semi-detached": 1650,
  detached: 1850,
  bungalow: 1750,
  default: 1650,
};

// Building-cost regional variation is real but much flatter than sale-price variation — dampen
// the refurb estimator's location modifier toward 1.0 rather than reusing it directly.
function rebuildLocationModifier(postcode: string | null | undefined): number {
  const { mod } = locationModifier(postcode);
  return 1 + (mod - 1) * 0.4;
}

// Coarse, postcode-area-level flood-risk heuristic — areas with well-known river/coastal/tidal
// flood history. This is a screening signal (raises the question with the user), not a
// substitute for an EA flood-risk map check.
const FLOOD_RISK_POSTCODES = /^(HU|PL|TQ|EX|GL|WR|SY|YO|DN|CA|LA|TN|ME|HR)/;

// Clay-soil subsidence risk is concentrated in London & the South-East, and matters most for
// older (pre-1960), non-flat properties (flats sit on shared/reinforced foundations).
const CLAY_SOIL_POSTCODES = /^(E|EC|N|NW|SE|SW|W|WC|RM|IG|BR|CR|DA|EN|HA|UB|KT|TW|SM|LU|SG|AL|CM)/;

const NON_STANDARD_CONSTRUCTION_RE = /non[\s-]?standard|prefab|pre-?cast reinforced concrete|\bprc\b|steel[\s-]?frame|timber[\s-]?frame|concrete[\s-]?frame/i;
const LISTED_BUILDING_RE = /listed building|grade\s?(i{1,2}\*?|2|1)\s?listed/i;

function rebuildRate(propertyType: string | null | undefined): { rate: number; key: string } {
  const t = (propertyType || "").toLowerCase();
  if (t.includes("flat") || t.includes("apartment") || t.includes("maisonette")) return { rate: REBUILD_PER_SQM.flat, key: "flat" };
  if (t.includes("terrace")) return { rate: REBUILD_PER_SQM.terrace, key: "terrace" };
  if (t.includes("semi")) return { rate: REBUILD_PER_SQM["semi-detached"], key: "semi-detached" };
  if (t.includes("detached") && !t.includes("semi")) return { rate: REBUILD_PER_SQM.detached, key: "detached" };
  if (t.includes("bungalow")) return { rate: REBUILD_PER_SQM.bungalow, key: "bungalow" };
  return { rate: REBUILD_PER_SQM.default, key: "default" };
}

/** Estimates an annual landlord buildings-insurance premium from rebuild cost, property age,
 *  area-based risk signals, construction type and (for HMO/SA) occupancy-type loading. Every
 *  multiplier is returned individually in `factors` so the UI can show its working. */
export function estimateInsurance(p: PropertyInput, strategy?: StrategyKey): InsuranceEstimate {
  const beds = p.beds ?? 3;
  const sqm = p.area_sqm ?? (60 + beds * 18);
  const { rate, key } = rebuildRate(p.property_type);
  const locMod = rebuildLocationModifier(p.postcode);
  const rebuildPerSqm = Math.round(rate * locMod);
  const rebuildCostGbp = Math.round(sqm * rebuildPerSqm);

  const pf = p.pf_json?.propertyLight ?? {};
  const pd = p.pf_json?.propertyDetail ?? {};
  const text = `${p.property_type ?? ""} ${pf.description ?? pd?.description ?? ""} ${pf.keywords?.join(" ") ?? ""}`;
  const yearBuilt: number | null = typeof pd?.yearBuilt === "number" ? pd.yearBuilt : null;
  const isFlat = (p.property_type || "").toLowerCase().includes("flat") || (p.property_type || "").toLowerCase().includes("apartment");

  const factors: InsuranceFactor[] = [];

  // Always-on landlord-cover loading — let properties carry higher claims frequency (tenant
  // damage, unoccupied-period risk, alternative-accommodation cover) than owner-occupied homes.
  factors.push({ label: "Landlord buildings cover", impactPct: 0.18, detail: "Let-property policies run higher than owner-occupier cover — includes loss-of-rent and alternative-accommodation provisions." });

  // Age band — older properties carry higher claims risk (wiring, plumbing, roof condition,
  // older materials harder/costlier to match on repair).
  if (yearBuilt == null) {
    factors.push({ label: "Build age unknown", impactPct: 0.05, detail: "No build date on file — a small precautionary loading is applied until the property's age is confirmed." });
  } else if (yearBuilt < 1900) {
    factors.push({ label: "Pre-1900 construction", impactPct: 0.30, detail: `Built ${yearBuilt < 1850 ? "before 1850" : "in the Victorian era"} — older materials, higher subsidence/structural claims history.` });
  } else if (yearBuilt < 1945) {
    factors.push({ label: "Pre-1945 construction", impactPct: 0.15, detail: `Built ${yearBuilt} — pre-war construction typically carries a moderate age loading.` });
  } else if (yearBuilt < 1980) {
    factors.push({ label: "1945-1980 construction", impactPct: 0.05, detail: `Built ${yearBuilt} — post-war construction carries a small age loading.` });
  }

  // Flood risk — coarse postcode-area screen.
  const outcode = (p.postcode || "").toUpperCase().replace(/\s+/g, "");
  if (FLOOD_RISK_POSTCODES.test(outcode)) {
    factors.push({ label: "Flood-risk area (postcode screen)", impactPct: 0.15, detail: "This postcode area has a history of river/coastal flood risk — confirm against the Environment Agency flood map; insurers may load or require flood excess." });
  }

  // Subsidence — clay soil concentrated in London & South-East, mainly affects older
  // non-flat properties (flats sit on shared/reinforced foundations).
  if (!isFlat && CLAY_SOIL_POSTCODES.test(outcode) && (yearBuilt == null || yearBuilt < 1960)) {
    factors.push({ label: "Subsidence risk (clay soil area)", impactPct: 0.10, detail: "London/South-East clay soils raise subsidence risk for older, non-flat properties — surveys/history of underpinning would refine this." });
  }

  // Listed building.
  if (LISTED_BUILDING_RE.test(text)) {
    factors.push({ label: "Listed building", impactPct: 0.20, detail: "Listed status requires like-for-like reinstatement with approved materials/methods — repairs cost more and need specialist insurers." });
  }

  // Non-standard construction.
  if (NON_STANDARD_CONSTRUCTION_RE.test(text)) {
    factors.push({ label: "Non-standard construction", impactPct: 0.25, detail: "Non-standard construction (steel/concrete/timber frame, PRC, prefab) is harder and costlier to rebuild/repair and needs a specialist insurer." });
  }

  // Strategy-specific occupancy loadings.
  if (strategy === "HMO") {
    factors.push({ label: "HMO occupancy", impactPct: 0.35, detail: "Multiple unrelated tenants raise claims frequency (escapes of water, accidental damage, fire) — needs a specific HMO landlord policy." });
  } else if (strategy === "SA") {
    factors.push({ label: "Short-let / serviced accommodation", impactPct: 0.25, detail: "High guest turnover and short-stay use needs a specific holiday-let/serviced-accommodation policy, priced above standard AST cover." });
  }

  const totalMultiplier = factors.reduce((m, f) => m * (1 + f.impactPct), 1);
  const baseRatePct = 0.0020; // ~0.20% of rebuild cost/yr before risk loadings — typical UK landlord buildings baseline
  const annualPremiumGbp = Math.round(rebuildCostGbp * baseRatePct * totalMultiplier);
  const monthlyPremiumGbp = Math.round((annualPremiumGbp / 12) * 100) / 100;

  return {
    rebuildCostGbp,
    rebuildPerSqm,
    baseRatePct,
    factors,
    totalMultiplier: Math.round(totalMultiplier * 100) / 100,
    annualPremiumGbp,
    monthlyPremiumGbp,
    notes: [
      `Rebuild cost: ${Math.round(sqm)}m² × £${rebuildPerSqm}/m² (${key}, location-adjusted) ≈ £${rebuildCostGbp.toLocaleString()}`,
      `Base rate ${(baseRatePct * 100).toFixed(2)}% × ${totalMultiplier.toFixed(2)}x risk loading`,
    ],
  };
}
