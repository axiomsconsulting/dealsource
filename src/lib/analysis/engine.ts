import type {
  PersonaInput, PropertyInput, SliderOverrides, OverrideKey,
  StrategyResult, StrategyNumber, AnalysisOutput, StrategyKey,
} from "./types";
import { OVERRIDE_BOUNDS } from "./types";
import { buildNegotiation } from "./negotiation";
import { computeRiskFlags, strategiesBlockedByRisk, maxRiskSeverity } from "./risk";
import { resolveMonthlyRent, proposeRentRange } from "./rent";
import { deriveLenderCriteria } from "./lender-criteria";
import { estimateRefurb, tierFromConditionScore } from "./refurb";
import { estimateMaxHmoRoomsByArea } from "./hmo-layout";

const SDLT_INVESTOR = (price: number) => {
  // UK SDLT additional-dwellings approximation (2024 rates +5% surcharge)
  const bands: [number, number][] = [
    [125_000, 0.05],
    [250_000, 0.07],
    [925_000, 0.10],
    [1_500_000, 0.15],
    [Infinity, 0.17],
  ];
  let tax = 0, prev = 0;
  for (const [cap, rate] of bands) {
    if (price <= prev) break;
    const slice = Math.min(price, cap) - prev;
    tax += slice * rate;
    prev = cap;
    if (price <= cap) break;
  }
  return Math.round(tax);
};

const EPC_RANK = ["A", "B", "C", "D", "E", "F", "G"];

/** All tunable inputs resolved to a concrete "no override" baseline value (raw units, same scale as SliderOverrides). */
export type ResolvedDefaults = Required<SliderOverrides>;

/** Builds a number cell that's directly tunable via an inline slider, carrying baseline + override metadata. */
function tunable(
  label: string,
  value: number,
  format: StrategyNumber["format"],
  key: OverrideKey,
  overrides: SliderOverrides,
  defaults: ResolvedDefaults,
  hint?: string,
): StrategyNumber {
  const bounds = OVERRIDE_BOUNDS[key];
  return {
    label, value, format, hint,
    overrideKey: key,
    min: bounds.min, max: bounds.max, step: bounds.step,
    baseline: defaults[key],
    overridden: overrides[key] !== undefined,
  };
}

function isArticle4Inside(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase();
  return s === "inside" || s === "in" || s === "yes" || s === "true";
}

function isArticle4Partial(status: string | null | undefined): boolean {
  return (status || "").toLowerCase() === "partial";
}

// NOTE: this is a SUITABILITY check — "would this deal work for this persona/client" — not a
// pricing input. The recommended offer is what the property and playbook justify regardless of who
// might buy it; a persona's budget only tells us whether THIS deal fits THAT client (or a different
// one would be a better match), per the deal sourcer's actual job of finding properties and then
// matching them to clients.
function evalPersonaMatch(p: PropertyInput, persona: PersonaInput, recommendedOffer: number): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (p.beds != null && (p.beds < persona.min_beds || p.beds > persona.max_beds)) {
    reasons.push(`Beds ${p.beds} outside target ${persona.min_beds}-${persona.max_beds}`);
  }
  const epc = (p.epc_rate || "").toUpperCase();
  if (epc && EPC_RANK.indexOf(epc) > EPC_RANK.indexOf(persona.min_epc)) {
    reasons.push(`EPC ${epc} worse than required ${persona.min_epc}`);
  }
  const keywords: string[] = (p.pf_json?.propertyLight?.keywords || []).map((k: string) => k.toLowerCase());
  if (persona.require_parking && keywords.length && !keywords.some((k) => k.includes("parking") || k.includes("garage") || k.includes("driveway"))) {
    reasons.push("No parking mentioned in listing");
  }
  if (recommendedOffer > persona.max_offer_gbp) {
    reasons.push(`Recommended offer £${Math.round(recommendedOffer).toLocaleString()} exceeds this persona's max budget of £${persona.max_offer_gbp.toLocaleString()} — better matched to a higher-budget client`);
  }
  return { pass: reasons.length === 0, reasons };
}

function mortgagePI(principal: number, annualRate: number, years = 25): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

function interestOnlyMonthly(principal: number, annualRate: number): number {
  return (principal * annualRate) / 12;
}

function btlAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"], defaults: ResolvedDefaults, overrides: SliderOverrides): StrategyResult {
  const reasons: string[] = [];
  const purchase = eff.offer_price;
  const refurb = eff.refurb_cost;
  const sdlt = SDLT_INVESTOR(purchase);
  const fees = 3500; // legal + survey + broker + sourcing
  const deposit = purchase * (1 - eff.ltv);
  const loan = purchase * eff.ltv;
  const cashIn = deposit + sdlt + fees + refurb;
  if (cashIn > persona.cash_available_gbp * 1.05) reasons.push(`Cash in (£${Math.round(cashIn)}) exceeds available £${persona.cash_available_gbp}`);

  const monthlyInt = interestOnlyMonthly(loan, eff.mortgage_rate);
  const monthlyRent = eff.monthly_rent;
  const mgmt = monthlyRent * 0.10;
  const voids = monthlyRent * 0.05;
  const maint = monthlyRent * 0.05;
  const insurance = 25;
  const monthlyCashflow = monthlyRent - monthlyInt - mgmt - voids - maint - insurance;

  const grossYield = (monthlyRent * 12) / purchase;
  const annualCashflow = monthlyCashflow * 12;
  const annualROI = cashIn > 0 ? annualCashflow / cashIn : 0;

  // stress test
  const stressInt = interestOnlyMonthly(loan, eff.stress_rate);
  const stressDSCR = (monthlyRent * 0.75) / stressInt; // 75% rent cover test (lender style)
  if (stressDSCR < 1.25) reasons.push(`Fails 125% DSCR at ${(eff.stress_rate * 100).toFixed(1)}% stress (got ${stressDSCR.toFixed(2)}x)`);

  let score = 0;
  score += Math.min(40, grossYield * 100 * 5);            // yield ~8% = 40pts
  score += Math.min(30, annualROI * 100 * 3);             // ROI ~10% = 30pts
  score += monthlyCashflow > 200 ? 20 : monthlyCashflow > 0 ? 10 : 0;
  score += stressDSCR >= 1.25 ? 10 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    key: "BTL",
    name: "Buy-to-Let",
    feasible: reasons.length === 0,
    reasons,
    cashLeftIn: cashIn,
    monthlyCashflow,
    annualROI,
    dealScore: score,
    summary: `${(grossYield * 100).toFixed(1)}% gross yield, £${Math.round(monthlyCashflow)}/mo cashflow, ${(annualROI * 100).toFixed(1)}% ROI on £${Math.round(cashIn)} in`,
    numbers: [
      tunable("Offer price", purchase, "gbp", "offer_price", overrides, defaults),
      tunable("Refurb budget", refurb, "gbp", "refurb_cost", overrides, defaults),
      tunable("Mortgage rate", eff.mortgage_rate, "pct", "mortgage_rate", overrides, defaults),
      tunable("LTV", eff.ltv, "pct", "ltv", overrides, defaults),
      { label: "SDLT (additional)", value: sdlt, format: "gbp" },
      { label: "Legal + fees", value: fees, format: "gbp" },
      { label: "Deposit", value: deposit, format: "gbp" },
      { label: "Loan", value: loan, format: "gbp" },
      { label: "Total cash in", value: cashIn, format: "gbp" },
      tunable("Monthly rent", monthlyRent, "gbp", "monthly_rent", overrides, defaults,
        eff.rent_range
          ? `Proposed range £${eff.rent_range.low.toLocaleString()}-£${eff.rent_range.high.toLocaleString()}/mo · ${eff.rent_range.basis}`
          : undefined),
      { label: "Interest-only payment", value: monthlyInt, format: "gbp" },
      { label: "Monthly cashflow (net)", value: monthlyCashflow, format: "gbp", hint: "after mgmt 10%, voids 5%, maintenance 5%, insurance" },
      { label: "Gross yield", value: grossYield, format: "pct" },
      { label: "Annual ROI", value: annualROI, format: "pct" },
      { label: `DSCR @ ${(eff.stress_rate * 100).toFixed(1)}% stress`, value: stressDSCR, format: "num", hint: "≥1.25 needed by most lenders" },
    ],
  };
}

function brrrAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"], defaults: ResolvedDefaults, overrides: SliderOverrides): StrategyResult {
  const reasons: string[] = [];
  const purchase = eff.offer_price;
  const refurb = eff.refurb_cost;
  const sdlt = SDLT_INVESTOR(purchase);
  const fees = 5000; // bridging exit + legals on refi
  const initialDeposit = purchase * 0.25;
  const bridge = purchase * 0.75;
  const bridgeMonths = 6;
  const bridgeCost = bridge * 0.10 * (bridgeMonths / 12) + bridge * 0.02;
  const cashInPre = initialDeposit + sdlt + fees + refurb + bridgeCost;

  const arv = eff.arv;
  if (arv <= purchase + refurb) reasons.push(`ARV (£${arv}) doesn't exceed all-in cost`);
  const refiLoan = arv * 0.75;
  const refiPayback = bridge;
  const cashOut = Math.max(0, refiLoan - refiPayback);
  const cashLeftIn = cashInPre - cashOut;

  const monthlyInt = interestOnlyMonthly(refiLoan, eff.mortgage_rate);
  const monthlyRent = eff.monthly_rent;
  const monthlyCashflow = monthlyRent * 0.80 - monthlyInt;
  const annualROI = cashLeftIn > 100 ? (monthlyCashflow * 12) / cashLeftIn : monthlyCashflow > 0 ? 999 : 0;

  let score = 0;
  score += cashLeftIn <= 5000 ? 40 : cashLeftIn <= 15000 ? 25 : cashLeftIn <= 30000 ? 10 : 0;
  score += monthlyCashflow > 200 ? 25 : monthlyCashflow > 0 ? 10 : 0;
  score += arv - purchase - refurb > 20000 ? 25 : arv - purchase - refurb > 0 ? 10 : 0;
  score += monthlyCashflow > 0 && cashLeftIn < persona.cash_available_gbp ? 10 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    key: "BRRR",
    name: "Buy-Refurb-Refinance-Rent",
    feasible: reasons.length === 0,
    reasons,
    cashLeftIn,
    monthlyCashflow,
    annualROI,
    dealScore: score,
    summary: `Recycle ${cashLeftIn <= 5000 ? "all" : `£${Math.round(cashOut)}`} of capital. £${Math.round(monthlyCashflow)}/mo cashflow after refi.`,
    numbers: [
      tunable("Purchase", purchase, "gbp", "offer_price", overrides, defaults),
      tunable("Refurb", refurb, "gbp", "refurb_cost", overrides, defaults),
      tunable("ARV (After Refurb Value)", arv, "gbp", "arv", overrides, defaults, "Drives how much you can refinance out"),
      { label: "Bridging cost (6mo)", value: bridgeCost, format: "gbp" },
      { label: "Cash in pre-refi", value: cashInPre, format: "gbp" },
      { label: "Refi loan @ 75% LTV", value: refiLoan, format: "gbp" },
      { label: "Cash pulled out", value: cashOut, format: "gbp", hint: "Rises as ARV rises or refurb/purchase fall" },
      { label: "Cash LEFT in", value: cashLeftIn, format: "gbp", hint: "Lower is better — under £5k = full recycle" },
      { label: "Monthly cashflow", value: monthlyCashflow, format: "gbp" },
      { label: "Annual ROI on left-in", value: annualROI, format: "pct" },
    ],
  };
}

function saAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"], defaults: ResolvedDefaults, overrides: SliderOverrides): StrategyResult {
  const reasons: string[] = [];
  const nightly = overrides.sa_nightly ?? defaults.sa_nightly;
  const occ = overrides.sa_occupancy ?? defaults.sa_occupancy;
  const monthlyRevenue = nightly * 30 * occ;
  const opex = monthlyRevenue * 0.45; // cleaning, utilities, platform, supplies
  const purchase = eff.offer_price;
  const loan = purchase * eff.ltv;
  const monthlyInt = interestOnlyMonthly(loan, eff.mortgage_rate);
  const monthlyCashflow = monthlyRevenue - opex - monthlyInt;
  const sdlt = SDLT_INVESTOR(purchase);
  const refurb = eff.refurb_cost + 12000; // furniture
  const cashIn = purchase * (1 - eff.ltv) + sdlt + 4000 + refurb;
  const annualROI = (monthlyCashflow * 12) / cashIn;

  const article4Status = p.article4_status ?? (p as any).ai_payload?.article4?.status ?? p.pf_json?.propertyLight?.article4Status ?? null;
  if (isArticle4Inside(article4Status)) reasons.push("Article 4 area — short-let (sui generis) use class change may require planning permission");
  if (p.tenure === "Leasehold") reasons.push("Leasehold — check short-let permitted");

  let score = Math.round(Math.min(100, monthlyCashflow / 10 + annualROI * 100 * 2));
  return {
    key: "SA",
    name: "Serviced Accommodation",
    feasible: reasons.length === 0,
    reasons,
    cashLeftIn: cashIn,
    monthlyCashflow,
    annualROI,
    dealScore: Math.max(0, Math.min(100, score)),
    summary: `£${Math.round(monthlyRevenue)}/mo revenue at ${Math.round(occ * 100)}% occ × £${nightly}. £${Math.round(monthlyCashflow)} net.`,
    numbers: [
      tunable("Nightly rate", nightly, "gbp", "sa_nightly", overrides, defaults),
      tunable("Occupancy", occ, "pct", "sa_occupancy", overrides, defaults),
      { label: "Monthly revenue", value: monthlyRevenue, format: "gbp", hint: "nightly × 30 nights × occupancy" },
      { label: "Opex (45%)", value: opex, format: "gbp", hint: "cleaning, platform fees, utilities, supplies" },
      { label: "Mortgage interest", value: monthlyInt, format: "gbp" },
      { label: "Monthly cashflow", value: monthlyCashflow, format: "gbp" },
      { label: "Cash in (incl. furniture £12k)", value: cashIn, format: "gbp" },
      { label: "Annual ROI", value: annualROI, format: "pct" },
    ],
  };
}

function hmoAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"], defaults: ResolvedDefaults, overrides: SliderOverrides): StrategyResult {
  const reasons: string[] = [];
  // Rooms is a headcount, never a fraction — round whatever the slider/default produced before
  // it touches any downstream maths or display (a "4.00-room HMO" is meaningless).
  const rooms = Math.round(overrides.room_count ?? defaults.room_count);
  const rentPerRoom = overrides.rent_per_room ?? defaults.rent_per_room;
  const monthlyRevenue = rooms * rentPerRoom;
  const opex = 350 + monthlyRevenue * 0.08; // bills + mgmt
  const purchase = eff.offer_price;
  const loan = purchase * eff.ltv;
  const monthlyInt = interestOnlyMonthly(loan, eff.mortgage_rate);
  const monthlyCashflow = monthlyRevenue - opex - monthlyInt;
  const conversionCost = (rooms >= 5 ? 25000 : 12000);
  const sdlt = SDLT_INVESTOR(purchase);
  const cashIn = purchase * (1 - eff.ltv) + sdlt + 3500 + eff.refurb_cost + conversionCost;
  const annualROI = (monthlyCashflow * 12) / cashIn;

  if (rooms >= 5) reasons.push("Mandatory HMO licence required (5+ rooms)");
  const article4Status = p.article4_status ?? (p as any).ai_payload?.article4?.status ?? p.pf_json?.propertyLight?.article4Status ?? null;
  const article4Blocks = isArticle4Inside(article4Status);
  if (article4Blocks) reasons.push("Article 4 area — planning permission required for change of use to HMO (C3→C4/Sui Generis)");

  const areaEstimate = estimateMaxHmoRoomsByArea(p.area_sqm);
  if (areaEstimate && rooms > areaEstimate.maxRooms) {
    reasons.push(`At the statutory minimum bedroom size (${areaEstimate.minRoomSqm}m²), ${p.area_sqm}m² total only realistically supports ~${areaEstimate.maxRooms} lettable room(s) after kitchen/bathroom/communal space — ${rooms} may not be achievable without an extension.`);
  }

  const score = Math.max(0, Math.min(100, Math.round(monthlyCashflow / 15 + annualROI * 100 * 2)));
  return {
    key: "HMO",
    name: "HMO",
    feasible: !article4Blocks,
    reasons,
    cashLeftIn: cashIn,
    monthlyCashflow,
    annualROI,
    dealScore: score,
    summary: `${rooms} rooms × £${rentPerRoom} = £${monthlyRevenue}/mo. £${Math.round(monthlyCashflow)} net cashflow.`,
    numbers: [
      tunable("Rooms", rooms, "count", "room_count", overrides, defaults,
        areaEstimate ? `Up to ~${areaEstimate.maxRooms} rooms fit at the statutory minimum bedroom size (${areaEstimate.minRoomSqm}m², ${Math.round(areaEstimate.communalReservePct * 100)}% reserved for kitchen/bathrooms/circulation)` : undefined),
      tunable("Rent per room", rentPerRoom, "gbp", "rent_per_room", overrides, defaults),
      { label: "Monthly revenue", value: monthlyRevenue, format: "gbp" },
      { label: "Bills + mgmt", value: opex, format: "gbp" },
      { label: "Mortgage interest", value: monthlyInt, format: "gbp" },
      { label: "HMO conversion cost", value: conversionCost, format: "gbp" },
      { label: "Cash in", value: cashIn, format: "gbp" },
      { label: "Monthly cashflow", value: monthlyCashflow, format: "gbp" },
      { label: "Annual ROI", value: annualROI, format: "pct" },
    ],
  };
}

function flipAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"], defaults: ResolvedDefaults, overrides: SliderOverrides): StrategyResult {
  const purchase = eff.offer_price;
  const refurb = eff.refurb_cost;
  const arv = eff.arv;
  const sdlt = SDLT_INVESTOR(purchase);
  const fees = 4000 + arv * 0.015; // buy + sell legals + EA
  const financeCost = purchase * 0.75 * 0.10 * 0.5; // 6mo bridge
  const totalCost = purchase + refurb + sdlt + fees + financeCost;
  const profit = arv - totalCost;
  const margin = profit / arv;
  const roi = profit / (purchase * 0.25 + sdlt + fees + refurb + financeCost);
  const reasons: string[] = [];
  if (margin < 0.15) reasons.push(`Margin ${(margin * 100).toFixed(1)}% below 15% rule of thumb`);
  if (profit < 20000) reasons.push("Profit below £20k benchmark");
  const score = Math.max(0, Math.min(100, Math.round(margin * 100 * 4 + Math.min(40, profit / 1000))));
  return {
    key: "FLIP",
    name: "Flip",
    feasible: profit > 0,
    reasons,
    monthlyCashflow: 0,
    annualROI: roi,
    dealScore: score,
    summary: `£${Math.round(profit)} profit at ${(margin * 100).toFixed(1)}% margin`,
    numbers: [
      tunable("Purchase", purchase, "gbp", "offer_price", overrides, defaults),
      tunable("Refurb", refurb, "gbp", "refurb_cost", overrides, defaults),
      tunable("GDV (resale)", arv, "gbp", "arv", overrides, defaults, "Gross Development Value — your expected resale price"),
      { label: "SDLT + fees + finance", value: sdlt + fees + financeCost, format: "gbp" },
      { label: "Total cost", value: totalCost, format: "gbp" },
      { label: "Profit", value: profit, format: "gbp" },
      { label: "Margin on GDV", value: margin, format: "pct" },
      { label: "ROI", value: roi, format: "pct" },
    ],
  };
}

function titleSplitAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"]): StrategyResult {
  const reasons: string[] = [];
  const feasible =
    (p.property_type || "").toLowerCase().includes("flat") === false &&
    p.tenure === "Freehold" &&
    (p.beds ?? 0) >= 4 &&
    (p.area_sqm ?? 0) >= 110;
  if (!feasible) {
    reasons.push("Title split needs freehold + 4+ beds + 110m² typically (planning dependent)");
  }
  const uplift = feasible ? 35000 : 0;
  return {
    key: "TITLE_SPLIT",
    name: "Title Split",
    feasible,
    reasons,
    dealScore: feasible ? 60 : 5,
    summary: feasible
      ? `Potential ~£${uplift} uplift by splitting into 2 dwellings (planning required)`
      : "Not suitable for title splitting",
    numbers: [
      { label: "Est. uplift", value: uplift, format: "gbp" },
      { label: "Planning + works", value: 35000, format: "gbp" },
      { label: "Net est.", value: uplift, format: "gbp" },
    ],
  };
}

export function analyseProperty(
  prop: PropertyInput,
  persona: PersonaInput,
  overrides: SliderOverrides = {},
): AnalysisOutput {
  // Risk flags (use stored if present, else compute)
  const riskFlags = Array.isArray((prop as any).risk_flags?.flags)
    ? (prop as any).risk_flags.flags
    : computeRiskFlags(prop);
  const blocked = strategiesBlockedByRisk(riskFlags as any);
  // Article 4 status: prefer the verified DB lookup, then the AI surveyor's web-grounded read,
  // then whatever the listing JSON itself claims — "any info provided in JSON or available online".
  const article4Status = prop.article4_status
    ?? (prop as any).ai_payload?.article4?.status
    ?? prop.pf_json?.propertyLight?.article4Status
    ?? null;
  const article4Council = (prop as any).article4_council ?? (prop as any).ai_payload?.article4?.council ?? null;

  // ---- Resolve every tunable input to its "natural" baseline (no override) AND its effective (possibly overridden) value ----

  // Refurb resolution — driven by the refurb estimator (AI-informed line items beat the plain algo).
  // Computed before the offer price because the negotiation playbook frames its opener partly
  // around the refurb-capex leverage point ("asking − refurb − margin").
  let refurb_default: number;
  let refurb_default_source: "algo" | "ai" | "persona_buffer" = "algo";
  const storedRefurb = (prop as any).refurb_estimate;
  if (storedRefurb?.total) {
    refurb_default = Number(storedRefurb.total);
    refurb_default_source = storedRefurb.lines?.some((l: any) => l.source === "ai") ? "ai" : "algo";
  } else {
    const aiRefurb = (prop as any).ai_payload?.refurb;
    const conditionScore = (prop as any).ai_payload?.condition?.score ?? null;
    const est = estimateRefurb(prop, tierFromConditionScore(conditionScore), aiRefurb?.items);
    refurb_default = est.total;
    refurb_default_source = aiRefurb ? "ai" : "algo";
  }
  if (!refurb_default || refurb_default < persona.refurb_buffer_gbp) {
    refurb_default = Math.max(refurb_default ?? 0, persona.refurb_buffer_gbp);
    if (refurb_default_source === "algo") refurb_default_source = "persona_buffer";
  }
  const refurb_cost = overrides.refurb_cost ?? refurb_default;
  const refurb_source: "algo" | "ai" | "persona_buffer" | "override" =
    overrides.refurb_cost != null ? "override" : refurb_default_source;

  // Offer price — driven by the negotiation playbook's algorithmic read of THIS property (asking
  // less evidenced, justifiable leverage), never by a persona's generic target/max budget. Marking
  // a property down to fit an investor's preferred number — rather than what the listing itself
  // supports — reads as not understanding the property and burns credibility with agents/sellers.
  const negotiation = buildNegotiation(prop, refurb_cost);
  const offer_price_default = negotiation.suggestedOffer;
  const offer_price = overrides.offer_price ?? offer_price_default;

  // Rent resolution — driven by AI surveyor / comparables first, persona target as fallback
  const rent = resolveMonthlyRent(prop, persona);
  const monthly_rent_default = rent.pcm ?? persona.target_rent_gbp;
  const monthly_rent = overrides.monthly_rent ?? monthly_rent_default;
  // Proposed band (not just a point estimate) for this property's type & area — lets the user
  // sanity-check the resolved rent against what comparable local stock actually lets for.
  const rent_range = proposeRentRange(prop, persona);

  // Lender criteria flow from HOW this investor borrows (personal name, Ltd co/SPV, portfolio,
  // etc.) rather than from a rate/LTV the persona guesses at upfront — different structures face
  // materially different lender appetite, pricing and stress methodology for the same property.
  const lenderCriteria = deriveLenderCriteria(persona.investor_type);
  const mortgage_rate = overrides.mortgage_rate ?? lenderCriteria.mortgage_rate;
  const ltv = overrides.ltv ?? lenderCriteria.ltv;
  const stress_rate = lenderCriteria.stress_rate;
  const arv_default = Math.round(offer_price * 1.18);
  const arv = overrides.arv ?? arv_default;

  const eff = {
    offer_price, monthly_rent, refurb_cost, mortgage_rate, ltv, arv, stress_rate,
    rent_source: rent.source, rent_trustworthy: rent.trustworthy, refurb_source,
    rent_range, lender_criteria: lenderCriteria,
  };

  // Room-count default: when we know the floor area, ground it in the statutory minimum
  // bedroom size for licensed HMOs (6.51m², after reserving space for kitchen/bathrooms/
  // circulation) rather than guessing off the listed bedroom count — "how many rooms are
  // technically possible" is a floor-area question, not a "beds + 1" heuristic. Falls back to
  // the bedroom-count heuristic only when no floor area is on file.
  const roomsByArea = estimateMaxHmoRoomsByArea(prop.area_sqm)?.maxRooms ?? null;
  const roomsByBeds = prop.beds ? prop.beds + (prop.beds >= 3 ? 1 : 0) : 4;
  const room_count_default = roomsByArea != null ? Math.max(1, Math.min(roomsByArea, OVERRIDE_BOUNDS.room_count.max)) : roomsByBeds;

  // Baselines for every slider-tunable lever — what the engine would compute with zero overrides.
  // These drive each number cell's "reset to default" target and its "overridden" badge.
  const defaults: ResolvedDefaults = {
    offer_price: offer_price_default,
    monthly_rent: monthly_rent_default,
    refurb_cost: refurb_default,
    mortgage_rate: lenderCriteria.mortgage_rate,
    ltv: lenderCriteria.ltv,
    arv: arv_default,
    room_count: room_count_default,
    rent_per_room: 525,
    sa_nightly: Math.max(85, monthly_rent / 12),
    sa_occupancy: 0.65,
  };

  let strategies: StrategyResult[] = [
    btlAnalysis(prop, persona, eff, defaults, overrides),
    brrrAnalysis(prop, persona, eff, defaults, overrides),
    saAnalysis(prop, persona, eff, defaults, overrides),
    hmoAnalysis(prop, persona, eff, defaults, overrides),
    flipAnalysis(prop, persona, eff, defaults, overrides),
    titleSplitAnalysis(prop, persona, eff),
  ];

  // HMO Article 4 — hmoAnalysis() already marks itself infeasible & explains why when "inside";
  // here we additionally cap its score so it can never outrank genuinely-feasible strategies,
  // and flag "partial" areas as a watch-out without blocking the strategy outright.
  if (isArticle4Inside(article4Status)) {
    strategies = strategies.map((s) => s.key === "HMO" ? { ...s, dealScore: Math.min(s.dealScore, 35) } : s);
  } else if (isArticle4Partial(article4Status)) {
    strategies = strategies.map((s) => s.key === "HMO" ? {
      ...s,
      reasons: [...(s.reasons ?? []), "Partial Article 4 in this postcode — verify the exact street before assuming permitted development."],
    } : s);
  }

  // Risk-flag strategy blocks + score caps
  if (blocked.size) {
    strategies = strategies.map((s) => blocked.has(s.key) ? {
      ...s,
      dealScore: Math.min(s.dealScore, 15),
      feasible: false,
      reasons: [...(s.reasons ?? []), "Disabled by risk flag — see warnings above."],
    } : s);
  }

  // "Best" must never be a strategy we've just marked infeasible (e.g. HMO blocked by Article 4) —
  // prefer the highest-scoring FEASIBLE strategy, only falling back to the raw top score if none qualify.
  const feasiblePool = strategies.filter((s) => s.feasible);
  const best = (feasiblePool.length ? feasiblePool : strategies).reduce((a, b) => (b.dealScore > a.dealScore ? b : a));
  let overallScore = Math.round(strategies.reduce((s, x) => s + x.dealScore, 0) / strategies.length);
  const sev = maxRiskSeverity(riskFlags as any);
  if (sev === "red") overallScore = Math.min(overallScore, 20);
  else if (sev === "amber") overallScore = Math.min(overallScore, 55);

  return {
    personaMatch: evalPersonaMatch(prop, persona, offer_price_default),
    effectiveInputs: eff,
    strategies,
    negotiation: negotiation.points,
    negotiationTotal: negotiation.totalLeverage,
    bestStrategy: best.key as StrategyKey,
    overallScore,
    riskFlags: riskFlags as any[],
    article4: article4Status ? { status: String(article4Status), council: article4Council } : null,
  };
}