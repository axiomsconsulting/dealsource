import type {
  PersonaInput, PropertyInput, SliderOverrides,
  StrategyResult, AnalysisOutput, StrategyKey,
} from "./types";
import { buildNegotiation } from "./negotiation";
import { computeRiskFlags, strategiesBlockedByRisk, maxRiskSeverity } from "./risk";
import { resolveMonthlyRent } from "./rent";
import { estimateRefurb, tierFromConditionScore } from "./refurb";

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

function evalPersonaMatch(p: PropertyInput, persona: PersonaInput): { pass: boolean; reasons: string[] } {
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

function btlAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"]): StrategyResult {
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
  const stressInt = interestOnlyMonthly(loan, persona.stress_rate);
  const stressDSCR = (monthlyRent * 0.75) / stressInt; // 75% rent cover test (lender style)
  if (stressDSCR < 1.25) reasons.push(`Fails 125% DSCR at ${(persona.stress_rate * 100).toFixed(1)}% stress (got ${stressDSCR.toFixed(2)}x)`);

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
      { label: "Offer price", value: purchase, format: "gbp" },
      { label: "Refurb budget", value: refurb, format: "gbp" },
      { label: "SDLT (additional)", value: sdlt, format: "gbp" },
      { label: "Legal + fees", value: fees, format: "gbp" },
      { label: "Deposit", value: deposit, format: "gbp" },
      { label: "Loan", value: loan, format: "gbp" },
      { label: "Total cash in", value: cashIn, format: "gbp" },
      { label: "Monthly rent", value: monthlyRent, format: "gbp" },
      { label: "Interest-only payment", value: monthlyInt, format: "gbp" },
      { label: "Monthly cashflow (net)", value: monthlyCashflow, format: "gbp", hint: "after mgmt 10%, voids 5%, maintenance 5%, insurance" },
      { label: "Gross yield", value: grossYield, format: "pct" },
      { label: "Annual ROI", value: annualROI, format: "pct" },
      { label: `DSCR @ ${(persona.stress_rate * 100).toFixed(1)}% stress`, value: stressDSCR, format: "num", hint: "≥1.25 needed by most lenders" },
    ],
  };
}

function brrrAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"]): StrategyResult {
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
      { label: "Purchase", value: purchase, format: "gbp" },
      { label: "Refurb", value: refurb, format: "gbp" },
      { label: "ARV (After Refurb Value)", value: arv, format: "gbp" },
      { label: "Bridging cost (6mo)", value: bridgeCost, format: "gbp" },
      { label: "Cash in pre-refi", value: cashInPre, format: "gbp" },
      { label: "Refi loan @ 75% LTV", value: refiLoan, format: "gbp" },
      { label: "Cash pulled out", value: cashOut, format: "gbp" },
      { label: "Cash LEFT in", value: cashLeftIn, format: "gbp", hint: "Lower is better — under £5k = full recycle" },
      { label: "Monthly cashflow", value: monthlyCashflow, format: "gbp" },
      { label: "Annual ROI on left-in", value: annualROI, format: "pct" },
    ],
  };
}

function saAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"], slider: SliderOverrides): StrategyResult {
  const reasons: string[] = [];
  const nightly = slider.sa_nightly ?? Math.max(85, eff.monthly_rent / 12);
  const occ = slider.sa_occupancy ?? 0.65;
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

  if (p.pf_json?.propertyLight?.article4Status === "In") reasons.push("Article 4 area — short-let restrictions may apply");
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
      { label: "Nightly rate", value: nightly, format: "gbp" },
      { label: "Occupancy", value: occ, format: "pct" },
      { label: "Monthly revenue", value: monthlyRevenue, format: "gbp" },
      { label: "Opex (45%)", value: opex, format: "gbp", hint: "cleaning, platform fees, utilities, supplies" },
      { label: "Mortgage interest", value: monthlyInt, format: "gbp" },
      { label: "Monthly cashflow", value: monthlyCashflow, format: "gbp" },
      { label: "Cash in (incl. furniture £12k)", value: cashIn, format: "gbp" },
      { label: "Annual ROI", value: annualROI, format: "pct" },
    ],
  };
}

function hmoAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"], slider: SliderOverrides): StrategyResult {
  const reasons: string[] = [];
  const rooms = slider.room_count ?? (p.beds ? p.beds + (p.beds >= 3 ? 1 : 0) : 4);
  const rentPerRoom = slider.rent_per_room ?? 525;
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
  if (p.pf_json?.propertyLight?.article4Status === "In") reasons.push("Article 4 — planning permission needed for HMO change of use");

  const score = Math.max(0, Math.min(100, Math.round(monthlyCashflow / 15 + annualROI * 100 * 2)));
  return {
    key: "HMO",
    name: "HMO",
    feasible: true,
    reasons,
    cashLeftIn: cashIn,
    monthlyCashflow,
    annualROI,
    dealScore: score,
    summary: `${rooms} rooms × £${rentPerRoom} = £${monthlyRevenue}/mo. £${Math.round(monthlyCashflow)} net cashflow.`,
    numbers: [
      { label: "Rooms", value: rooms, format: "num" },
      { label: "Rent per room", value: rentPerRoom, format: "gbp" },
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

function flipAnalysis(p: PropertyInput, persona: PersonaInput, eff: AnalysisOutput["effectiveInputs"]): StrategyResult {
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
      { label: "Purchase", value: purchase, format: "gbp" },
      { label: "Refurb", value: refurb, format: "gbp" },
      { label: "GDV (resale)", value: arv, format: "gbp" },
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
  const article4Status = prop.article4_status ?? prop.pf_json?.propertyLight?.article4Status ?? null;

  const offer_price = overrides.offer_price ?? Math.min(persona.target_offer_gbp, prop.asking_price_gbp ?? persona.target_offer_gbp);

  // Rent resolution
  const rent = resolveMonthlyRent(prop, persona);
  const monthly_rent = overrides.monthly_rent ?? rent.pcm ?? persona.target_rent_gbp;

  // Refurb resolution
  let refurb_cost = overrides.refurb_cost;
  let refurb_source: "algo" | "ai" | "persona_buffer" | "override" = "override";
  if (refurb_cost == null) {
    const stored = (prop as any).refurb_estimate;
    if (stored?.total) {
      refurb_cost = Number(stored.total);
      refurb_source = stored.lines?.some((l: any) => l.source === "ai") ? "ai" : "algo";
    } else {
      const ai = (prop as any).ai_payload?.refurb;
      const conditionScore = (prop as any).ai_payload?.condition?.score ?? null;
      const est = estimateRefurb(prop, tierFromConditionScore(conditionScore), ai?.items);
      refurb_cost = est.total;
      refurb_source = ai ? "ai" : "algo";
      // attach for downstream display via overrides? leave it — UI calls estimateRefurb itself
    }
    if (!refurb_cost || refurb_cost < persona.refurb_buffer_gbp) {
      refurb_cost = Math.max(refurb_cost ?? 0, persona.refurb_buffer_gbp);
      if (refurb_source === "algo") refurb_source = "persona_buffer";
    }
  }

  const mortgage_rate = overrides.mortgage_rate ?? persona.mortgage_rate;
  const ltv = overrides.ltv ?? persona.ltv;
  const arv = overrides.arv ?? Math.round(offer_price * 1.18);

  const eff = {
    offer_price, monthly_rent, refurb_cost, mortgage_rate, ltv, arv,
    rent_source: rent.source, rent_trustworthy: rent.trustworthy, refurb_source,
  };

  let strategies: StrategyResult[] = [
    btlAnalysis(prop, persona, eff),
    brrrAnalysis(prop, persona, eff),
    saAnalysis(prop, persona, eff, overrides),
    hmoAnalysis(prop, persona, eff, overrides),
    flipAnalysis(prop, persona, eff),
    titleSplitAnalysis(prop, persona, eff),
  ];

  // HMO Article 4 cap
  if (article4Status === "inside" || article4Status === "In") {
    strategies = strategies.map((s) => s.key === "HMO" ? {
      ...s,
      dealScore: Math.min(s.dealScore, 35),
      feasible: false,
      reasons: [...(s.reasons ?? []), "Article 4 area — full planning permission required for change of use to HMO (C3→C4/Sui Generis)."],
    } : s);
  } else if (article4Status === "partial") {
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

  const best = strategies.reduce((a, b) => (b.dealScore > a.dealScore ? b : a));
  let overallScore = Math.round(strategies.reduce((s, x) => s + x.dealScore, 0) / strategies.length);
  const sev = maxRiskSeverity(riskFlags as any);
  if (sev === "red") overallScore = Math.min(overallScore, 20);
  else if (sev === "amber") overallScore = Math.min(overallScore, 55);

  return {
    personaMatch: evalPersonaMatch(prop, persona),
    effectiveInputs: eff,
    strategies,
    negotiation: buildNegotiation(prop, persona, eff),
    bestStrategy: best.key as StrategyKey,
    overallScore,
    riskFlags: riskFlags as any[],
    article4: article4Status ? { status: String(article4Status), council: (prop as any).article4_council ?? null } : null,
  };
}