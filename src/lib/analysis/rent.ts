import type { PersonaInput, PropertyInput } from "./types";

export type RentSource = "pf_json" | "csv" | "ai_comparables" | "manual" | "persona_default" | "none";

export interface ResolvedRent {
  pcm: number | null;
  source: RentSource;
  trustworthy: boolean;
  label: string;
}

export function resolveMonthlyRent(p: PropertyInput, persona: PersonaInput): ResolvedRent {
  if (p.estimated_rent_pcm && p.rent_source && p.rent_source !== "persona_default" && p.rent_source !== "none") {
    const src = p.rent_source as RentSource;
    return { pcm: Number(p.estimated_rent_pcm), source: src, trustworthy: src !== "persona_default", label: labelFor(src) };
  }
  // PF JSON rent fields (defensive)
  const pf = p.pf_json ?? {};
  const pfRent = pf.propertyLight?.rentEstimate ?? pf.propertyLight?.rentPcm ?? pf.propertyDetail?.rent?.pcm ?? null;
  if (pfRent && Number(pfRent) > 0) {
    return { pcm: Number(pfRent), source: "pf_json", trustworthy: true, label: labelFor("pf_json") };
  }
  if (persona?.target_rent_gbp) {
    return { pcm: persona.target_rent_gbp, source: "persona_default", trustworthy: false, label: labelFor("persona_default") };
  }
  return { pcm: null, source: "none", trustworthy: false, label: "Rent unknown" };
}

export interface RentRange {
  low: number;
  mid: number;
  high: number;
  basis: string;
  evidence?: string[];
}

/** Proposes a plausible monthly-rent band (not just a point estimate) so the user can sanity-check
 *  the resolved figure against what comparable stock in the area actually lets for. Prefers the AI
 *  surveyor's grounded local comparables (already keyed to this property's type & postcode); falls
 *  back to a heuristic band around the resolved estimate, sized by how tightly that property type
 *  tends to cluster (uniform flats/studios narrow, characterful houses/HMO stock wide). */
export function proposeRentRange(p: PropertyInput, persona: PersonaInput): RentRange | null {
  const aiRent = (p as any).ai_payload?.rent;
  const aiLow = Number(aiRent?.low), aiHigh = Number(aiRent?.high);
  if (aiLow > 0 && aiHigh > aiLow) {
    return {
      low: aiLow,
      high: aiHigh,
      mid: aiRent?.pcm ? Number(aiRent.pcm) : Math.round((aiLow + aiHigh) / 2),
      basis: "AI surveyor's local comparables for this property type & postcode",
      evidence: Array.isArray(aiRent?.evidence) ? aiRent.evidence.slice(0, 4) : undefined,
    };
  }

  const resolved = resolveMonthlyRent(p, persona);
  if (!resolved.pcm) return null;
  const type = (p.property_type || "").toLowerCase();
  const spread = type.includes("studio") ? 0.10
    : (type.includes("flat") || type.includes("apartment") || type.includes("maisonette")) ? 0.13
    : (type.includes("terrace") || type.includes("semi") || type.includes("end")) ? 0.16
    : 0.20;
  const mid = resolved.pcm;
  const area = p.postcode?.split(" ")[0] ?? p.tenure ?? "this area";
  return {
    low: Math.round((mid * (1 - spread)) / 5) * 5,
    mid,
    high: Math.round((mid * (1 + spread)) / 5) * 5,
    basis: `Heuristic band around the ${resolved.label.toLowerCase()} for a ${(p.property_type || "property").toLowerCase()} in ${area} — refine with local comparables`,
  };
}

function labelFor(s: RentSource): string {
  switch (s) {
    case "pf_json": return "Listing / Property Filter";
    case "csv": return "CSV import";
    case "ai_comparables": return "AI comparables";
    case "manual": return "Manual override";
    case "persona_default": return "Persona default (estimate)";
    default: return "Unknown";
  }
}