import type { PropertyInput, NegotiationGuidance, NegotiationPoint } from "./types";

export interface NegotiationResult {
  points: NegotiationPoint[];
  /** Algorithmic target accepted offer — deliberately independent of any criteria profile's target/max
   *  budget so the recommendation stays grounded in the property itself, not a generic client
   *  preference. The opening bid is lower and lives in `guidance.openingOffer`. */
  suggestedOffer: number;
  /** Sum of every weighted, justifiable adjustment line item. These are negotiation impacts, not
   *  raw repair bills: a £10k defect may justify only £4k-£6k off unless the seller has no better
   *  buyer pool. */
  totalLeverage: number;
  guidance: NegotiationGuidance;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundMoney(n: number): number {
  const step = n < 125_000 ? 500 : 1_000;
  return Math.round(n / step) * step;
}

function roundOfferBelowAsking(n: number, asking: number): number {
  if (asking <= 0) return 0;
  const step = n < 125_000 ? 500 : 1_000;
  return Math.max(0, Math.min(asking - step, roundMoney(n)));
}

function impactPct(asking: number, pct: number, capPct: number): number {
  return Math.round(Math.min(asking * pct, asking * capPct));
}

function priceBand(asking: number): { label: string; baseDiscountPct: number } {
  if (asking < 125_000) return { label: "sub-£125k", baseDiscountPct: 0.075 };
  if (asking < 250_000) return { label: "£125k-£250k", baseDiscountPct: 0.095 };
  if (asking < 500_000) return { label: "£250k-£500k", baseDiscountPct: 0.085 };
  return { label: "£500k+", baseDiscountPct: 0.07 };
}

function maxCredibleOpeningDiscount(asking: number, points: NegotiationPoint[]): number {
  if (asking <= 0) return 0;
  const band = priceBand(asking);
  const motivation = points
    .filter((p) => p.category === "leverage")
    .reduce((s, p) => s + p.gbp_impact, 0) / asking;
  const defects = points
    .filter((p) => p.category === "fault" || p.category === "condition" || p.category === "improvement_gap")
    .reduce((s, p) => s + p.gbp_impact, 0) / asking;
  const highConfidenceCount = points.filter((p) => p.confidence === "high").length;

  // A normal sub-asking opener lives around the base band. Verified defects and seller motivation
  // increase the range, but only by part of their value: agents compare against the next buyer, not
  // against a perfect spreadsheet.
  const evidenceUplift =
    Math.min(0.04, motivation * 0.45) +
    Math.min(0.055, defects * 0.55) +
    Math.min(0.015, highConfidenceCount * 0.004);

  return clamp(band.baseDiscountPct + evidenceUplift, 0.05, 0.22);
}

function stanceFor(discountPct: number, points: NegotiationPoint[]): NegotiationGuidance["stance"] {
  if (points.some((p) => p.category === "fault" && p.confidence !== "low")) return "survey-led";
  if (discountPct >= 0.13) return "firm";
  if (discountPct <= 0.055) return "light";
  return "standard";
}

/** Pure, criteria-independent negotiation playbook: what the numbers themselves justify offering. */
export function buildNegotiation(
  prop: PropertyInput,
  refurbCost: number,
): NegotiationResult {
  const points: NegotiationPoint[] = [];
  const pf = prop.pf_json?.propertyLight ?? {};
  const pd = prop.pf_json?.propertyDetail ?? {};
  const asking = prop.asking_price_gbp ?? 0;

  // Market signals
  if (pf.multipleReduce && pf.multipleReduce > 1) {
    const impact = impactPct(asking, 0.015 + Math.min(0.0225, (pf.multipleReduce - 1) * 0.0075), 0.04);
    points.push({
      category: "leverage",
      title: `Price reduced ${pf.multipleReduce} time(s)`,
      description: `Seller has already re-tested the price. This is motivation evidence, not a blank cheque: weight it as a modest discount chip and keep the reduction history ready if the agent asks why you are below asking.`,
      gbp_impact: impact,
      confidence: "high",
    });
  }
  if (pf.multipleBack && pf.multipleBack >= 2) {
    const impact = impactPct(asking, 0.025 + Math.min(0.03, (pf.multipleBack - 2) * 0.01), 0.055);
    points.push({
      category: "leverage",
      title: `Back on market ${pf.multipleBack}× (chain breaks / withdrawn buyers)`,
      description: `The listing has fallen through before, so certainty has value. Use this to justify a firmer opener, but do not assume every fall-through was caused by a defect until survey or agent notes confirm it.`,
      gbp_impact: impact,
      confidence: "high",
    });
  }

  // EPC
  const epc = (prop.epc_rate || "").toUpperCase();
  if (["D", "E", "F", "G"].includes(epc)) {
    // EPC spend to reach C — a dedicated bill-of-materials line, broken into Low/Medium/High spec
    // tiers so the offer can be framed around "however they want to play it, here's what closing
    // the gap costs". Where the register's own improvement roadmap is available (cumulative cost
    // to the step that lands the property in band C — see epc.functions.ts buildEpcData), use that
    // grounded figure for L (cheapest path to C) and H (full works); otherwise fall back to a
    // banded heuristic. M is always the midpoint — the number actually used to frame the ask.
    const epcData: any = (prop as any).epc_data ?? null;
    const recs: any[] = Array.isArray(epcData?.recommendations) ? epcData.recommendations : [];
    const stepToC = recs.find((r) => typeof r.resultingScore === "number" && r.resultingScore >= 69);
    let lowSpec: number, highSpec: number, grounded: boolean;
    if (stepToC && (stepToC.cumulativeCostMin > 0 || stepToC.cumulativeCostMax > 0)) {
      lowSpec = stepToC.cumulativeCostMin || stepToC.cumulativeCostMax;
      highSpec = Math.max(stepToC.cumulativeCostMax || stepToC.cumulativeCostMin, lowSpec);
      grounded = true;
    } else {
      const base = epc === "D" ? 3500 : epc === "E" ? 7500 : 12000;
      lowSpec = Math.round(base * 0.6);
      highSpec = Math.round(base * 1.6);
      grounded = false;
    }
    const midSpec = Math.round((lowSpec + highSpec) / 2);
    const recoveryRate = grounded ? 0.5 : epc === "D" ? 0.35 : 0.45;
    const negotiationImpact = Math.round(Math.min(midSpec * recoveryRate, asking * (epc === "D" ? 0.025 : 0.045)));
    points.push({
      category: "improvement_gap",
      title: `EPC ${epc} spend to reach C`,
      description: grounded
        ? `The register's improvement roadmap indicates roughly £${midSpec.toLocaleString()} at midpoint to move toward EPC C. Only £${negotiationImpact.toLocaleString()} is treated as offer leverage because buyers rarely recover every pound of future capex upfront unless the work is urgent or lender-blocking.`
        : `No assessor-costed roadmap is on file, so the cost range is heuristic. Use the midpoint as evidence, but weight only £${negotiationImpact.toLocaleString()} into the first offer; the rest is reserve for survey-stage negotiation.`,
      gbp_impact: negotiationImpact,
      confidence: grounded ? "high" : "medium",
      specOptions: [
        { rating: "L", label: "Low spec — minimum to qualify", gbp: lowSpec },
        { rating: "M", label: "Medium spec — realistic midpoint", gbp: midSpec },
        { rating: "H", label: "High spec — full works", gbp: highSpec },
      ],
    });
  }

  // Last sold history
  if (pf.lastSold?.value && pf.lastSold?.date) {
    const years = (Date.now() - new Date(pf.lastSold.date).getTime()) / (365.25 * 24 * 3600 * 1000);
    const cagr = Math.pow(asking / pf.lastSold.value, 1 / Math.max(years, 1)) - 1;
    if (cagr > 0.06) {
      const fairTrendValue = pf.lastSold.value * Math.pow(1.04, Math.max(years, 1));
      const overTrend = Math.max(0, asking - fairTrendValue);
      const impact = Math.round(Math.min(overTrend * 0.35, asking * 0.05));
      points.push({
        category: "leverage",
        title: `Ask implies ${(cagr * 100).toFixed(1)}% p.a. since last sale`,
        description: `Last sold £${pf.lastSold.value.toLocaleString()} in ${new Date(pf.lastSold.date).getFullYear()}. Treat this as a comparable-pricing challenge, not a defect: only part of the gap above a 4% trend line is counted until sold comparables confirm it.`,
        gbp_impact: impact,
        confidence: "medium",
      });
    }
  }

  // Equity (seller may be willing to drop)
  if (typeof pf.equity === "number" && pf.equity > 0.5) {
    points.push({
      category: "leverage",
      title: `Seller has ~${Math.round(pf.equity * 100)}% equity`,
      description: `High equity means the seller may have room to transact, but it does not prove motivation. Keep this as a small confidence chip rather than a headline reason for a deep discount.`,
      gbp_impact: impactPct(asking, 0.01, 0.0125),
      confidence: "medium",
    });
  }

  // CSV price diff (Property Filter calc)
  // (Reductions already covered above by multipleReduce.)

  // Condition / property-detail signals
  if (!["D", "E", "F", "G"].includes(epc) && typeof pd?.epcEfficiency === "number" && pd.epcEfficiency < 60) {
    points.push({
      category: "condition",
      title: "Low EPC efficiency score",
      description: "Energy efficiency is poor — expect older windows/insulation/boiler. Get quotes from a local heating engineer and factor into your offer.",
      gbp_impact: Math.min(2500, Math.round(asking * 0.015)),
      confidence: "low",
    });
  }

  // Covenant
  if (pf.isCovenantRestricted) {
    points.push({
      category: "fault",
      title: "Covenant restrictions on title",
      description: "Property has registered covenants — could limit extensions, use class change, or HMO conversion. Ask solicitor for full schedule before exchange and use this as leverage if it affects your strategy.",
      gbp_impact: 2500,
      confidence: "medium",
    });
  }

  // Refurb-based opening
  if (refurbCost > 2500) {
    const refurbImpact = Math.round(Math.min(refurbCost * 0.35, asking * 0.07));
    points.push({
      category: "improvement_gap",
      title: "Refurb capex offsetting",
      description: `Your refurb budget is £${refurbCost.toLocaleString()}. A serious buyer normally asks the seller to share the pain, not fund the entire refurb. This weights £${refurbImpact.toLocaleString()} into the offer and keeps the rest for survey/quote evidence.`,
      gbp_impact: refurbImpact,
      confidence: "high",
    });
  }

  // Always include the offer plan anchor. Strategy underwriting uses the target accepted offer,
  // not the lower opening bid, so the deal does not look artificially strong before negotiation.
  const totalLeverage = points.reduce((s, p) => s + p.gbp_impact, 0);
  const band = priceBand(asking);
  const maxOpeningDiscountPct = maxCredibleOpeningDiscount(asking, points);
  const uncappedDiscountPct = asking > 0 ? totalLeverage / asking : 0;
  const credibleDiscountPct = clamp(Math.min(uncappedDiscountPct, maxOpeningDiscountPct), 0, maxOpeningDiscountPct);
  const retainedLeverage = Math.max(0, Math.round(totalLeverage - asking * credibleDiscountPct));
  const openingOffer = credibleDiscountPct > 0 ? roundOfferBelowAsking(asking * (1 - credibleDiscountPct), asking) : asking;
  const walkAwayDiscountPct = credibleDiscountPct > 0
    ? clamp(credibleDiscountPct * 0.45, Math.min(0.0125, credibleDiscountPct), Math.max(0.0125, credibleDiscountPct - 0.01))
    : 0;
  const walkAwayOffer = asking > 0 && credibleDiscountPct > 0
    ? roundOfferBelowAsking(Math.max(openingOffer + 500, asking * (1 - walkAwayDiscountPct)), asking)
    : asking;
  const targetOffer = asking > 0 && walkAwayOffer > openingOffer
    ? roundOfferBelowAsking(openingOffer + (walkAwayOffer - openingOffer) * 0.45, asking)
    : openingOffer;
  const warnings: string[] = [];
  if (uncappedDiscountPct > maxOpeningDiscountPct) {
    warnings.push(`The evidence totals ${(uncappedDiscountPct * 100).toFixed(1)}% of asking, but the credible opening range for a ${band.label} property is capped at ${(maxOpeningDiscountPct * 100).toFixed(1)}% unless survey/legal defects get stronger.`);
  }
  if (retainedLeverage > 0) {
    warnings.push(`Keep £${retainedLeverage.toLocaleString()} of evidence back for counter-offers or survey-stage renegotiation rather than trying to win it all in the first bid.`);
  }
  const guidance: NegotiationGuidance = {
    askingPrice: asking,
    openingOffer,
    targetOffer,
    walkAwayOffer,
    appliedLeverage: Math.max(0, asking - targetOffer),
    retainedLeverage,
    fullLeverage: totalLeverage,
    credibleDiscountPct,
    maxOpeningDiscountPct,
    priceBand: band.label,
    stance: stanceFor(credibleDiscountPct, points),
    warnings,
  };
  points.unshift({
    category: "leverage",
    title: `Offer plan: open £${openingOffer.toLocaleString()}, target £${targetOffer.toLocaleString()}`,
    description: `Underwrite the deal at the likely accepted target, not the first bid. Opening at £${openingOffer.toLocaleString()} is the evidence-led anchor; target £${targetOffer.toLocaleString()} is the working purchase price; walk away above £${walkAwayOffer.toLocaleString()} unless fresh evidence improves the deal.`,
    gbp_impact: asking - targetOffer,
    confidence: "high",
  });

  return { points, suggestedOffer: targetOffer, totalLeverage, guidance };
}
