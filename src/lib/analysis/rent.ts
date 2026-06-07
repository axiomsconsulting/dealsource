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