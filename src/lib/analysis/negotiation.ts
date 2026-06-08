import type { PersonaInput, PropertyInput, NegotiationPoint } from "./types";

export interface NegotiationResult {
  points: NegotiationPoint[];
  /** Algorithmic recommended opening offer — asking less justifiable, evidenced leverage. Drives
   *  the strategy-comparison baseline; deliberately independent of any persona's target/max budget
   *  so the recommendation stays grounded in the property itself, not a generic client preference. */
  suggestedOffer: number;
  /** Sum of every justified-adjustment line item (excludes the "suggested opening offer" anchor,
   *  which restates this total as a price) — the headline "total justified reduction" figure. */
  totalLeverage: number;
}

// Anchoring far below this reads as not understanding the property — agents/sellers dismiss it
// outright rather than negotiate. Even a property riddled with justifiable leverage rarely moves
// further than this in one step; bigger gaps get closed over multiple rounds, not the opener.
const REALISTIC_OFFER_FLOOR_PCT = 0.75;

/** Pure, persona-independent negotiation playbook: what the numbers themselves justify offering. */
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
    points.push({
      category: "leverage",
      title: `Price reduced ${pf.multipleReduce} time(s)`,
      description: `Seller has dropped the price ${pf.multipleReduce}× already — this signals motivation. Open with the recent reduction trend in mind and anchor below current asking.`,
      gbp_impact: Math.round(asking * 0.04),
      confidence: "high",
    });
  }
  if (pf.multipleBack && pf.multipleBack >= 2) {
    points.push({
      category: "leverage",
      title: `Back on market ${pf.multipleBack}× (chain breaks / withdrawn buyers)`,
      description: `Listing has fallen through ${pf.multipleBack} times. Underlying issues (survey, finance, condition) likely. Use this to justify a sub-asking offer "to provide certainty".`,
      gbp_impact: Math.round(asking * 0.05),
      confidence: "high",
    });
  }

  // EPC
  const epc = (prop.epc_rate || "").toUpperCase();
  if (["D", "E", "F", "G"].includes(epc)) {
    points.push({
      category: "improvement_gap",
      title: `EPC ${epc} — below MEES 2030 target`,
      description: `From 2030 most rentals must be EPC C+. Buying at EPC ${epc} means committing capex (insulation £1.5k–£4k, double glazing top-up £2k–£6k, low-energy boiler £3k). Use this to negotiate a price reduction reflecting that work.`,
      gbp_impact: epc === "D" ? 3500 : epc === "E" ? 7500 : 12000,
      confidence: "medium",
    });

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
    points.push({
      category: "improvement_gap",
      title: "EPC spend to reach C",
      description: grounded
        ? `The register's own improvement roadmap shows the cumulative cost of the measures needed to lift this property from EPC ${epc} into band C${stepToC?.resultingBand === "C" ? "" : " or better"} (step ${stepToC.sequence ?? "?"}: "${stepToC.title}"). L = cheapest qualifying route, H = full assessor-costed works, M = realistic midpoint — quote M when framing the ask, and hold L/H in reserve to match whatever spec level the seller pushes back with.`
        : `No assessor-costed roadmap on file for this certificate, so this is a banded estimate from the EPC ${epc} → C gap (insulation, glazing, heating). L = bare-minimum measures to scrape into C, H = full comprehensive works, M = realistic midpoint — quote M, and use L/H as your floor and ceiling depending on how the seller responds.`,
      gbp_impact: midSpec,
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
      points.push({
        category: "leverage",
        title: `Ask implies ${(cagr * 100).toFixed(1)}% p.a. since last sale`,
        description: `Last sold £${pf.lastSold.value.toLocaleString()} in ${new Date(pf.lastSold.date).getFullYear()}. Local long-run growth is ~3–4% p.a.; the ask bakes in optimistic appreciation. Use comparable sold prices to anchor lower.`,
        gbp_impact: Math.round((cagr - 0.035) * pf.lastSold.value * years * 0.5),
        confidence: "medium",
      });
    }
  }

  // Equity (seller may be willing to drop)
  if (typeof pf.equity === "number" && pf.equity > 0.5) {
    points.push({
      category: "leverage",
      title: `Seller has ~${Math.round(pf.equity * 100)}% equity`,
      description: `Seller likely has strong equity — they can absorb a price reduction without going below their mortgage redemption. Sub-asking offers are realistic.`,
      gbp_impact: Math.round(asking * 0.03),
      confidence: "medium",
    });
  }

  // CSV price diff (Property Filter calc)
  // (Reductions already covered above by multipleReduce.)

  // Condition / property-detail signals
  if (typeof pd?.epcEfficiency === "number" && pd.epcEfficiency < 60) {
    points.push({
      category: "condition",
      title: "Low EPC efficiency score",
      description: "Energy efficiency is poor — expect older windows/insulation/boiler. Get quotes from a local heating engineer and factor into your offer.",
      gbp_impact: 4000,
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
  points.push({
    category: "improvement_gap",
    title: "Refurb capex offsetting",
    description: `Your refurb budget is £${refurbCost.toLocaleString()}. Frame your offer as "asking − refurb − margin" so the seller sees the maths, not just a lowball number.`,
    gbp_impact: Math.round(refurbCost * 0.6),
    confidence: "high",
  });

  // Always include "your number" anchor — purely algorithmic: asking less the justified leverage
  // above, floored so the opener stays credible. No persona target/max feeds into this; an
  // investor's personal budget says nothing about what THIS seller will realistically accept.
  const totalLeverage = points.reduce((s, p) => s + p.gbp_impact, 0);
  const realisticFloor = Math.round(asking * REALISTIC_OFFER_FLOOR_PCT);
  const suggestedOffer = Math.max(realisticFloor, Math.round(asking - totalLeverage));
  const cappedAt = suggestedOffer === realisticFloor && asking - totalLeverage < realisticFloor;
  points.unshift({
    category: "leverage",
    title: `Suggested opening offer: £${Math.round(suggestedOffer).toLocaleString()}`,
    description: cappedAt
      ? `The justifiable adjustments below total £${totalLeverage.toLocaleString()} — more than asking minus a credible opener. Anchored at ${Math.round(REALISTIC_OFFER_FLOOR_PCT * 100)}% of asking instead; going lower risks the agent or seller writing you off as not understanding the property. Build the rest of your case for follow-up rounds.`
      : `Asking £${asking.toLocaleString()} less the £${totalLeverage.toLocaleString()} of justifiable adjustments below. Open ~5% lower than this to leave negotiation room — target £${Math.round(suggestedOffer * 0.95).toLocaleString()}.`,
    gbp_impact: asking - suggestedOffer,
    confidence: "high",
  });

  return { points, suggestedOffer, totalLeverage };
}