import type { NegotiationGuidance, NegotiationPoint } from "./types";

function fmtGBP0(n: number): string {
  return `£${Math.round(n).toLocaleString()}`;
}

/** Builds a plain-text script summarising the offer and the reasoning behind it — written so it
 *  can be read out, or pasted into an email/message, when talking to an agent or seller. */
export function buildTalkingPointsScript(guidance: NegotiationGuidance, negotiation: NegotiationPoint[]): string {
  const lines: string[] = [];
  const discountPct = guidance.askingPrice > 0
    ? Math.round(((guidance.askingPrice - guidance.targetOffer) / guidance.askingPrice) * 100)
    : 0;

  // Survey-confirmed condition findings (from the Survey & condition leverage panel) get their
  // own section, since they're the strongest possible evidence — a surveyor has actually looked.
  const surveyPoints = negotiation.filter((n) => n.title.startsWith("Survey:"));
  const otherPoints = negotiation.filter((n) => !n.title.startsWith("Survey:"));

  lines.push(`Asking price: ${fmtGBP0(guidance.askingPrice)}`);
  lines.push(`My offer: ${fmtGBP0(guidance.targetOffer)} (${discountPct}% below asking)`);
  lines.push(`Opening position: ${fmtGBP0(guidance.openingOffer)} · Walk-away ceiling: ${fmtGBP0(guidance.walkAwayOffer)}`);
  lines.push("");
  lines.push("Reasons for this offer:");

  if (otherPoints.length === 0) {
    lines.push("- No specific adjustments — offer reflects the asking price for this property.");
  } else {
    for (const n of otherPoints) {
      lines.push(`- ${n.title} (~${fmtGBP0(n.gbp_impact)}): ${n.description}`);
    }
  }

  if (surveyPoints.length > 0) {
    lines.push("");
    lines.push(`Survey results (additional reduction: ~${fmtGBP0(surveyPoints.reduce((s, n) => s + n.gbp_impact, 0))}):`);
    for (const n of surveyPoints) {
      lines.push(`- ${n.title.replace(/^Survey:\s*/, "")} (~${fmtGBP0(n.gbp_impact)}): ${n.description}`);
    }
  }

  lines.push("");
  lines.push(`Total weighted adjustment: ~${fmtGBP0(negotiation.reduce((s, n) => s + n.gbp_impact, 0))}`);

  if (guidance.epcToCCost != null) {
    lines.push("");
    lines.push(`Note: this also accounts for ~${fmtGBP0(guidance.epcToCCost)} to bring the EPC up to band C, required to let the property under MEES rules from 2030 — this is reflected in the walk-away ceiling above.`);
  }

  if (guidance.sourcingBuffer?.enabled) {
    const sb = guidance.sourcingBuffer;
    lines.push("");
    lines.push(
      `Sourcing-buffer working: post-refurb GDV ${fmtGBP0(sb.gdv)} × ${Math.round((1 - sb.profitPct) * 100)}% (after ${Math.round(sb.profitPct * 100)}% profit margin) − refurb costs − ${fmtGBP0(sb.sourcingFeeGbp)} sourcing fee = ${fmtGBP0(sb.computedOffer)} opening position.`
    );
  }

  if (guidance.warnings.length > 0) {
    lines.push("");
    lines.push("Caveats to keep in mind before presenting this:");
    for (const w of guidance.warnings) lines.push(`- ${w}`);
  }

  return lines.join("\n");
}
