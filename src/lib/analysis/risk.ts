import type { PropertyInput } from "./types";

export type RiskFlagKey =
  | "shared_ownership" | "leasehold_short" | "leasehold_unknown_term"
  | "listed_building" | "auction" | "developer_invitation"
  | "land_only" | "planning_only" | "fake_or_underpriced" | "retirement_only";

export interface RiskFlag {
  key: RiskFlagKey;
  severity: "red" | "amber";
  label: string;
  reason: string;
}

const RE = {
  shared: /shared\s*ownership|staircas(?:ing|e)|%\s*share|part\s*buy/i,
  listed: /grade\s*(i{1,3}|1|2|3)\b|listed\s+building/i,
  auction: /\bauction\b|guide\s*price|modern\s+method|mmoa|reservation\s+fee|unconditional/i,
  developer: /off[\s-]?plan|coming\s+soon|reservations?\s+open|new[\s-]?build|show\s*home|prices?\s+from\s+£|from\s+£?\d|starting\s+price|offers?\s+invited\s+from|developer/i,
  land: /\bland\b|building\s+plot|\bplot\b|\bdevelopment\s+opportunity\b/i,
  planning: /planning\s+permission\s+(granted|approved)|with\s+planning|outline\s+planning/i,
  retirement: /over\s*55|over\s*60|over\s*65|retirement\s+(home|apartment|flat)|sheltered\s+(housing|accommodation)|age\s+restricted/i,
};

function textPool(p: PropertyInput): string {
  const pf = p.pf_json ?? {};
  return [
    p.address,
    p.property_type,
    pf.propertyLight?.title,
    pf.propertyLight?.subtitle,
    pf.propertyLight?.description,
    pf.propertyDetail?.description,
    pf.propertyDetail?.summary,
    (pf.propertyLight?.keywords ?? []).join(" "),
  ].filter(Boolean).join(" \n ");
}

export function computeRiskFlags(p: PropertyInput): RiskFlag[] {
  const out: RiskFlag[] = [];
  const t = textPool(p);
  const type = (p.property_type || "").toLowerCase();

  if (RE.shared.test(t)) out.push({ key: "shared_ownership", severity: "red", label: "Shared ownership", reason: "Shared-ownership / staircasing wording detected — not a standard investment purchase." });
  if (RE.listed.test(t)) out.push({ key: "listed_building", severity: "amber", label: "Listed building", reason: "Listed status restricts works and increases refurb cost / risk." });
  if (RE.auction.test(t)) out.push({ key: "auction", severity: "amber", label: "Auction", reason: "Auction or MMoA listing — bidding fees, faster timelines, unconditional risk." });
  if (RE.developer.test(t) && !RE.auction.test(t)) out.push({ key: "developer_invitation", severity: "amber", label: "Developer invitation", reason: '"From £" / new-build / off-plan listing — likely developer invitation, not a real deal.' });
  if (RE.land.test(type) || RE.land.test(t) && (p.beds == null || p.beds === 0)) out.push({ key: "land_only", severity: "red", label: "Land only", reason: "Land / plot with no dwelling — not in BTL/HMO/SA scope." });
  if (RE.planning.test(t) && (p.beds == null || p.beds === 0)) out.push({ key: "planning_only", severity: "amber", label: "Planning only", reason: "Site with planning, no dwelling — development play, not standard investment." });
  if (RE.retirement.test(t)) out.push({ key: "retirement_only", severity: "amber", label: "Age-restricted", reason: "Age-restricted / retirement property — not lettable as a standard rental." });

  const tenure = (p.tenure || "").toLowerCase();
  const leaseYrs = (p as any).lease_years_remaining ?? p.pf_json?.propertyLight?.leaseYearsRemaining ?? p.pf_json?.propertyDetail?.leaseYearsRemaining ?? null;
  if (tenure.includes("leasehold")) {
    if (leaseYrs != null && leaseYrs < 80) {
      out.push({ key: "leasehold_short", severity: "red", label: `Short lease (${leaseYrs}y)`, reason: "Lease under 80 years — most lenders decline; extension cost can be material." });
    } else if (leaseYrs == null) {
      out.push({ key: "leasehold_unknown_term", severity: "amber", label: "Leasehold — term unknown", reason: "Leasehold tenure with no lease length disclosed — confirm before offering." });
    }
  }

  if (p.asking_price_gbp != null && p.asking_price_gbp > 0 && p.asking_price_gbp < 30000 && !out.some((f) => f.key === "land_only")) {
    out.push({ key: "fake_or_underpriced", severity: "amber", label: "Underpriced / suspect", reason: "Price under £30k for a residential dwelling — often auction guide, dilapidated, or data error." });
  }

  return out;
}

export function maxRiskSeverity(flags: RiskFlag[] | null | undefined): "none" | "amber" | "red" {
  if (!flags?.length) return "none";
  return flags.some((f) => f.severity === "red") ? "red" : "amber";
}

export function strategiesBlockedByRisk(flags: RiskFlag[]): Set<string> {
  const blocked = new Set<string>();
  for (const f of flags) {
    if (f.key === "shared_ownership" || f.key === "land_only") {
      ["BTL", "BRRR", "SA", "HMO", "FLIP", "TITLE_SPLIT"].forEach((k) => blocked.add(k));
    }
    if (f.key === "leasehold_short") ["BTL", "BRRR", "HMO"].forEach((k) => blocked.add(k));
    if (f.key === "retirement_only") ["BTL", "BRRR", "SA", "HMO", "FLIP"].forEach((k) => blocked.add(k));
    if (f.key === "planning_only") ["BTL", "SA", "HMO"].forEach((k) => blocked.add(k));
  }
  return blocked;
}

export const RISK_IMPROVEMENTS: Record<RiskFlagKey, string> = {
  shared_ownership: "Confirm whether the listing is genuinely shared ownership or just shared-equity wording. If shared ownership, exclude from your pipeline — staircasing and lender restrictions make it unsuitable for standard BTL.",
  leasehold_short: "Get lease length from the agent. Under 80 years → ask the seller to extend before exchange, or price in the statutory extension premium (often £15–40k) as a negotiation chip.",
  leasehold_unknown_term: "Ask the agent for lease term, ground rent, service charge, and any onerous clauses (doubling ground rent, permission fees). Required before any offer.",
  listed_building: "Pull the Historic England listing entry. Listed status means LBC for most works — budget +15–25% on refurb and +6 weeks on timeline.",
  auction: "Treat the guide price as a floor, not the price. Read the legal pack BEFORE bidding (special conditions can shift fees, completion timelines, and seller costs onto buyer).",
  developer_invitation: "If this is a developer 'from £' listing, it's an invitation to register interest, not a real deal. Remove from comparables; price will be set at launch.",
  land_only: "Out of scope for BTL/HMO/SA. Move to a 'development pipeline' list if you do land deals, otherwise hide.",
  planning_only: "Verify planning is implemented and not lapsed (3-year rule). Cost out the build before offering — land+build often exceeds GDV in current market.",
  fake_or_underpriced: "Cross-check sold prices on the street. If genuinely under-priced, expect best-and-final bidding war — set your walk-away number now. Otherwise likely auction guide or data error.",
  retirement_only: "Age-restricted housing can't be let to under-55s. Exclude from rental strategies.",
};