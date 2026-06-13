import type { PropertyInput, NegotiationGuidance, NegotiationPoint } from "./types";
import { extractPriceHistory, summarisePriceHistory } from "./price-history";
import { buildSurveyNegotiationPoints } from "./survey-strategy";
import { estimateLeaseExtensionPremium } from "./lease-extension";
import {
  buildEpcRoadmap,
  buildEpcMeasureCandidates,
  resolveEpcMeasureSelection,
  deriveAiEpcCategories,
} from "./epc-plan";
import { circumstanceFlexPct } from "../seller-context";

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

function roundOfferCtx(n: number, asking: number, allowAsking: boolean): number {
  if (asking <= 0) return roundMoney(n);
  const step = n < 125_000 ? 500 : 1_000;
  const rounded = roundMoney(n);
  return Math.max(0, Math.min(allowAsking ? asking : asking - step, rounded));
}

function impactPct(asking: number, pct: number, capPct: number): number {
  return Math.round(Math.min(asking * pct, asking * capPct));
}

// UK deal-sourcing convention: packaged "BMV" deals are typically marketed at 15-25% below
// market value as the baseline qualifying threshold for sourcing investors, with
// highly-motivated-seller deals reaching 25-35%. These bands are tuned for a sourcing-investor
// opener, not a polite first offer.
function priceBand(asking: number): { label: string; baseDiscountPct: number } {
  if (asking < 125_000) return { label: "sub-£125k", baseDiscountPct: 0.12 };
  if (asking < 250_000) return { label: "£125k-£250k", baseDiscountPct: 0.15 };
  if (asking < 500_000) return { label: "£250k-£500k", baseDiscountPct: 0.13 };
  return { label: "£500k+", baseDiscountPct: 0.11 };
}

function maxCredibleOpeningDiscount(asking: number, points: NegotiationPoint[]): number {
  if (asking <= 0) return 0;
  const band = priceBand(asking);
  const motivation =
    points.filter((p) => p.category === "leverage").reduce((s, p) => s + p.gbp_impact, 0) / asking;
  const defects =
    points
      .filter(
        (p) =>
          p.category === "fault" || p.category === "condition" || p.category === "improvement_gap",
      )
      .reduce((s, p) => s + p.gbp_impact, 0) / asking;
  const highConfidenceCount = points.filter((p) => p.confidence === "high").length;

  // A normal sub-asking opener lives around the base band. Verified defects and seller motivation
  // increase the range, but only by part of their value: agents compare against the next buyer, not
  // against a perfect spreadsheet.
  const evidenceUplift =
    Math.min(0.04, motivation * 0.45) +
    Math.min(0.055, defects * 0.55) +
    Math.min(0.015, highConfidenceCount * 0.004);

  return clamp(band.baseDiscountPct + evidenceUplift, 0.05, 0.3);
}

function stanceFor(discountPct: number, points: NegotiationPoint[]): NegotiationGuidance["stance"] {
  if (points.some((p) => p.category === "fault" && p.confidence !== "low")) return "survey-led";
  if (discountPct >= 0.13) return "firm";
  if (discountPct <= 0.055) return "light";
  return "standard";
}

/** Pure, criteria-independent negotiation playbook: what the numbers themselves justify offering. */
export function buildNegotiation(prop: PropertyInput, refurbCost: number): NegotiationResult {
  const points: NegotiationPoint[] = [];
  const pf = prop.pf_json?.propertyLight ?? {};
  const pd = prop.pf_json?.propertyDetail ?? {};
  const asking = prop.asking_price_gbp ?? 0;

  // Market signals
  if (pf.multipleReduce && pf.multipleReduce > 1) {
    const impact = impactPct(
      asking,
      0.015 + Math.min(0.0225, (pf.multipleReduce - 1) * 0.0075),
      0.04,
    );
    // Where the feed gives us the actual tracked price points, cite pounds and dates rather than
    // just a reduction count — a concrete trajectory is much harder for an agent to wave away.
    const trail = summarisePriceHistory(extractPriceHistory(prop));
    points.push({
      category: "leverage",
      title: `Price reduced ${pf.multipleReduce} time(s)`,
      description: trail
        ? `Seller has already re-tested the price. ${trail} Weight it as a modest discount chip, not a blank cheque — keep this trail ready if the agent asks why you are below asking.`
        : `Seller has already re-tested the price. This is motivation evidence, not a blank cheque: weight it as a modest discount chip and keep the reduction history ready if the agent asks why you are below asking.`,
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

  // EPC — also tracked outside the points array so it can additionally tighten the walk-away
  // ceiling below (5c): MEES requires band C to let from 2030, so this is a hard cost a buyer
  // will need to cover regardless of how the rest of the negotiation goes.
  let epcToCCost: number | null = null;
  let epcRecoveryAmount = 0;
  const epc = (prop.epc_rate || "").toUpperCase();
  const epcData: any = (prop as any).epc_data ?? null;
  const roadmap = epcData ? buildEpcRoadmap(epcData) : null;
  if (roadmap) {
    // EPC spend — a dedicated bill-of-materials line, broken into Low/Medium/High spec tiers so
    // the offer can be framed around "however they want to play it, here's what closing the gap
    // costs". Grounded directly in the user's per-measure selection on the EPC card (defaulting
    // to the assessor's path to band C, plus anything the AI photo scan flagged) — M is always
    // the midpoint, the number actually used to frame the ask.
    const aiCategories = deriveAiEpcCategories((prop as any).ai_payload);
    const candidates = buildEpcMeasureCandidates(roadmap, aiCategories);
    const { totals } = resolveEpcMeasureSelection(
      candidates,
      (prop as any).refurb_estimate?.epcMeasures,
    );
    if (totals.mid > 0) {
      const lowSpec = totals.low;
      const highSpec = Math.max(totals.high, lowSpec);
      const midSpec = totals.mid;
      const recoveryRate = epc === "D" ? 0.45 : 0.5;
      const negotiationImpact = Math.round(
        Math.min(midSpec * recoveryRate, asking * (epc === "D" ? 0.025 : 0.045)),
      );
      epcToCCost = midSpec;
      epcRecoveryAmount = Math.round(midSpec * recoveryRate);
      points.push({
        category: "improvement_gap",
        title: `EPC ${epc || "rating"} — selected upgrade measures`,
        description:
          `Based on the ${totals.count} measure${totals.count === 1 ? "" : "s"} selected on the EPC card, the register's improvement roadmap indicates roughly £${midSpec.toLocaleString()} at midpoint. Only £${negotiationImpact.toLocaleString()} is treated as offer leverage because buyers rarely recover every pound of future capex upfront unless the work is urgent or lender-blocking.` +
          (["D", "E", "F", "G"].includes(epc)
            ? ` Letting an EPC ${epc} property will be illegal under MEES rules from 2030 without reaching band C, so £${epcRecoveryAmount.toLocaleString()} of this is also baked into your walk-away ceiling below as a hard cost regardless of how the rest of the negotiation goes.`
            : ""),
        gbp_impact: negotiationImpact,
        confidence: "high",
        specOptions: [
          { rating: "L", label: "Low spec — minimum to qualify", gbp: lowSpec },
          { rating: "M", label: "Medium spec — realistic midpoint", gbp: midSpec },
          { rating: "H", label: "High spec — full works", gbp: highSpec },
        ],
      });
    }
  } else if (["D", "E", "F", "G"].includes(epc)) {
    // No certificate on file — fall back to a banded heuristic.
    const base = epc === "D" ? 3500 : epc === "E" ? 7500 : 12000;
    const lowSpec = Math.round(base * 0.6);
    const highSpec = Math.round(base * 1.6);
    const midSpec = Math.round((lowSpec + highSpec) / 2);
    const recoveryRate = epc === "D" ? 0.35 : 0.45;
    const negotiationImpact = Math.round(
      Math.min(midSpec * recoveryRate, asking * (epc === "D" ? 0.025 : 0.045)),
    );
    epcToCCost = midSpec;
    epcRecoveryAmount = Math.round(midSpec * recoveryRate);
    points.push({
      category: "improvement_gap",
      title: `EPC ${epc} spend to reach C`,
      description:
        `No assessor-costed roadmap is on file, so the cost range is heuristic. Use the midpoint as evidence, but weight only £${negotiationImpact.toLocaleString()} into the first offer; the rest is reserve for survey-stage negotiation.` +
        ` Letting an EPC ${epc} property will be illegal under MEES rules from 2030 without reaching band C, so £${epcRecoveryAmount.toLocaleString()} of this is also baked into your walk-away ceiling below as a hard cost regardless of how the rest of the negotiation goes.`,
      gbp_impact: negotiationImpact,
      confidence: "medium",
      specOptions: [
        { rating: "L", label: "Low spec — minimum to qualify", gbp: lowSpec },
        { rating: "M", label: "Medium spec — realistic midpoint", gbp: midSpec },
        { rating: "H", label: "High spec — full works", gbp: highSpec },
      ],
    });
  }

  // Short lease — extending it is a buyer cost, not a discussion point, and most lenders
  // decline anything under ~80 years. Estimated using the same ground-rent-loss +
  // reversionary-interest (+ marriage value below 80 years) structure as Property Filter's
  // lease-extension calculator.
  if ((prop.tenure || "").toLowerCase().includes("leasehold")) {
    const leaseYrs =
      (prop as any).lease_years_remaining ??
      prop.pf_json?.propertyLight?.leaseYearsRemaining ??
      prop.pf_json?.propertyDetail?.leaseYearsRemaining ??
      null;
    if (typeof leaseYrs === "number" && leaseYrs > 0 && leaseYrs < 90 && asking > 0) {
      const ASSUMED_GROUND_RENT_PA = 250; // typical modern flat ground rent — refine once the lease/title is seen
      const lease = estimateLeaseExtensionPremium(leaseYrs, ASSUMED_GROUND_RENT_PA, asking);
      if (lease) {
        const impact = Math.round(Math.min(lease.premiumMid * 0.5, asking * 0.06));
        points.push({
          category: "improvement_gap",
          title: `Short lease (${leaseYrs}y) — extension premium`,
          description: `Estimated lease-extension premium ~£${lease.premiumLow.toLocaleString()}-£${lease.premiumHigh.toLocaleString()} (ground-rent loss + reversionary interest${lease.hasMarriageValue ? " + marriage value, since the term is under 80 years" : ""}), assuming a typical £${ASSUMED_GROUND_RENT_PA}/yr ground rent — confirm the actual ground rent from the lease. ${leaseYrs < 80 ? "Under 80 years, the cost roughly doubles once marriage value applies — this only gets more expensive the longer it's left." : "Most mainstream lenders are uneasy below ~80-85 years remaining, so factor the extension into your numbers even though marriage value doesn't yet apply."} Only part of this is treated as opening leverage; the rest is reserve for survey-stage negotiation.`,
          gbp_impact: impact,
          confidence: "medium",
        });
      }
    }
    // leaseYrs == null is already surfaced via the "leasehold_unknown_term" risk flag.
  }

  // Landlord-readiness costing (5b) — statutory compliance items every let property needs,
  // plus AI-detected gaps from photo analysis. These are routine pre-letting costs a buyer
  // factors into their opening number, not survey-stage surprises.
  const newBuildSignal =
    /new[\s-]?build/i.test(
      `${prop.property_type ?? ""} ${pf.description ?? pd?.description ?? ""}`,
    ) ||
    (typeof pd?.yearBuilt === "number" && pd.yearBuilt >= 2020);
  if (!newBuildSignal) {
    points.push({
      category: "improvement_gap",
      title: "EICR (Electrical Installation Condition Report)",
      description:
        "A valid EICR is a legal requirement before letting. Budget ~£150-250 for a fresh report (plus any remedial work it flags). Treat this as a routine compliance line in your opening number, not a point to debate.",
      gbp_impact: 200,
      confidence: "high",
    });
  }

  const heatingText = `${pd?.heating ?? pf?.heating ?? ""}`.toLowerCase();
  const electricOnly = heatingText.includes("electric") && !heatingText.includes("gas");
  if (!electricOnly) {
    points.push({
      category: "improvement_gap",
      title: "CP12 (Gas Safety Certificate)",
      description:
        "An annual CP12 gas safety check is a legal requirement for let properties with gas appliances. Budget ~£80-120 for the check (more if remedial work is needed) — a routine compliance cost to fold into your opening number.",
      gbp_impact: 100,
      confidence: heatingText.includes("gas") ? "high" : "medium",
    });
  }

  const landlordReadiness = (prop as any).ai_payload?.landlordReadiness;
  const whiteGoodsMissing: string[] = Array.isArray(landlordReadiness?.whiteGoodsMissing)
    ? landlordReadiness.whiteGoodsMissing
    : [];
  if (whiteGoodsMissing.length > 0) {
    const perItem = 450;
    points.push({
      category: "improvement_gap",
      title: `White goods missing: ${whiteGoodsMissing.join(", ")}`,
      description: `AI photo analysis found no ${whiteGoodsMissing.join("/")} in the kitchen photos. As a landlord you'll need to supply these — budget ~£300-600 each (£${perItem.toLocaleString()} used here per item). Fold this into your opening number rather than treating it as a survey-stage surprise.`,
      gbp_impact: whiteGoodsMissing.length * perItem,
      confidence: "medium",
    });
  }
  if (landlordReadiness?.gardenNeedsClearance) {
    points.push({
      category: "improvement_gap",
      title: "Garden / yard clearance",
      description:
        "AI photo analysis flagged the garden or front yard as overgrown or cluttered. Budget ~£300-800 for clearance before the property is lettable — a routine pre-letting cost worth weighting into your opening number.",
      gbp_impact: 550,
      confidence: "low",
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
  if (
    !["D", "E", "F", "G"].includes(epc) &&
    typeof pd?.epcEfficiency === "number" &&
    pd.epcEfficiency < 60
  ) {
    points.push({
      category: "condition",
      title: "Low EPC efficiency score",
      description:
        "Energy efficiency is poor — expect older windows/insulation/boiler. Get quotes from a local heating engineer and factor into your offer.",
      gbp_impact: Math.min(2500, Math.round(asking * 0.015)),
      confidence: "low",
    });
  }

  // Covenant
  if (pf.isCovenantRestricted) {
    points.push({
      category: "fault",
      title: "Covenant restrictions on title",
      description:
        "Property has registered covenants — could limit extensions, use class change, or HMO conversion. Ask solicitor for full schedule before exchange and use this as leverage if it affects your strategy.",
      gbp_impact: 2500,
      confidence: "medium",
    });
  }

  // Survey-confirmed condition findings (checkboxes + severity in the Survey & condition
  // leverage panel) — these are the strongest possible evidence (a surveyor has actually looked),
  // so they're added as high-confidence "fault" points and feed straight into the offer plan
  // and talking points alongside everything else.
  points.push(...buildSurveyNegotiationPoints(prop));

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
  const credibleDiscountPct = clamp(
    Math.min(uncappedDiscountPct, maxOpeningDiscountPct),
    0,
    maxOpeningDiscountPct,
  );
  const retainedLeverage = Math.max(0, Math.round(totalLeverage - asking * credibleDiscountPct));
  const preOpeningOffer =
    credibleDiscountPct > 0
      ? roundOfferBelowAsking(asking * (1 - credibleDiscountPct), asking)
      : asking;
  const walkAwayDiscountPct =
    credibleDiscountPct > 0
      ? clamp(
          credibleDiscountPct * 0.45,
          Math.min(0.0125, credibleDiscountPct),
          Math.max(0.0125, credibleDiscountPct - 0.01),
        )
      : 0;
  const walkAwayOfferBeforeEpc =
    asking > 0 && credibleDiscountPct > 0
      ? roundOfferBelowAsking(
          Math.max(preOpeningOffer + 500, asking * (1 - walkAwayDiscountPct)),
          asking,
        )
      : asking;
  // 5c: even if the rest of the negotiation goes the seller's way, don't pay more than the
  // walk-away ceiling minus what reaching EPC band C will cost — MEES makes this a hard
  // requirement to let the property from 2030, not a discussion point.
  const preWalkAwayOffer =
    epcRecoveryAmount > 0
      ? roundOfferBelowAsking(
          Math.max(preOpeningOffer, walkAwayOfferBeforeEpc - epcRecoveryAmount),
          asking,
        )
      : walkAwayOfferBeforeEpc;
  const preTargetOffer =
    asking > 0 && preWalkAwayOffer > preOpeningOffer
      ? roundOfferBelowAsking(preOpeningOffer + (preWalkAwayOffer - preOpeningOffer) * 0.45, asking)
      : preOpeningOffer;

  // Seller-context flex (circumstances + AI comparables) — softens the offer plan further,
  // moved here from NegotiationPanel so every consumer of `guidance` sees the same numbers
  // without an extra "Apply" click.
  const sellerCtx = (prop as any).seller_context ?? null;
  const circFlex = circumstanceFlexPct(sellerCtx);
  const compMid = sellerCtx?.aiFlex?.reductionPctMid ?? 0;
  const combinedFlexPct = Math.max(-0.03, Math.min(0.1, compMid + circFlex));
  const sellerContextAdjustment = asking * combinedFlexPct * 0.5;
  const maxContextDiscountPct = Math.min(
    0.24,
    maxOpeningDiscountPct + Math.max(0, combinedFlexPct * 0.35),
  );
  const contextFloor = asking * (1 - maxContextDiscountPct);

  const openingOffer =
    asking > 0
      ? roundOfferCtx(
          Math.max(contextFloor, Math.min(asking, preOpeningOffer - sellerContextAdjustment)),
          asking,
          preOpeningOffer >= asking && sellerContextAdjustment <= 0,
        )
      : preOpeningOffer;
  const targetOffer =
    asking > 0
      ? roundOfferCtx(
          Math.max(openingOffer, Math.min(asking, preTargetOffer - sellerContextAdjustment * 0.45)),
          asking,
          preTargetOffer >= asking && sellerContextAdjustment <= 0,
        )
      : preTargetOffer;
  const walkAwayOffer =
    asking > 0
      ? roundOfferCtx(
          Math.min(
            asking,
            Math.max(targetOffer + 500, preWalkAwayOffer - sellerContextAdjustment * 0.25),
          ),
          asking,
          preWalkAwayOffer >= asking && sellerContextAdjustment <= 0,
        )
      : preWalkAwayOffer;

  const warnings: string[] = [];
  if (uncappedDiscountPct > maxOpeningDiscountPct) {
    warnings.push(
      `The evidence totals ${(uncappedDiscountPct * 100).toFixed(1)}% of asking, but the credible opening range for a ${band.label} property is capped at ${(maxOpeningDiscountPct * 100).toFixed(1)}% unless survey/legal defects get stronger.`,
    );
  }
  if (retainedLeverage > 0) {
    warnings.push(
      `Keep £${retainedLeverage.toLocaleString()} of evidence back for counter-offers or survey-stage renegotiation rather than trying to win it all in the first bid.`,
    );
  }
  if (epcRecoveryAmount > 0) {
    warnings.push(
      `Walk-away ceiling reduced by £${epcRecoveryAmount.toLocaleString()} to cover bringing the EPC up to band C — required to let the property under MEES rules from 2030.`,
    );
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
    epcToCCost,
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
