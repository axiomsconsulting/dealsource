import type { PersonaInput, PropertyInput, NegotiationPoint, AnalysisOutput } from "./types";

export function buildNegotiation(
  prop: PropertyInput,
  persona: PersonaInput,
  eff: AnalysisOutput["effectiveInputs"],
): NegotiationPoint[] {
  const points: NegotiationPoint[] = [];
  const pf = prop.pf_json?.propertyLight ?? {};
  const pd = prop.pf_json?.propertyDetail ?? {};
  const asking = prop.asking_price_gbp ?? eff.offer_price;

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
    description: `Your refurb budget is £${eff.refurb_cost.toLocaleString()}. Frame your offer as "asking − refurb − margin" so the seller sees the maths, not just a lowball number.`,
    gbp_impact: Math.round(eff.refurb_cost * 0.6),
    confidence: "high",
  });

  // Always include "your number" anchor
  const totalLeverage = points.reduce((s, p) => s + p.gbp_impact, 0);
  const suggestedOffer = Math.max(persona.target_offer_gbp, asking - totalLeverage);
  points.unshift({
    category: "leverage",
    title: `Suggested opening offer: £${Math.round(suggestedOffer).toLocaleString()}`,
    description: `Asking £${asking.toLocaleString()} less the £${totalLeverage.toLocaleString()} of justifiable adjustments below. Open ~5% lower than this to leave negotiation room — target £${Math.round(suggestedOffer * 0.95).toLocaleString()}.`,
    gbp_impact: asking - suggestedOffer,
    confidence: "high",
  });

  return points;
}