export type FeedbackVote = "up" | "down";
export type FeedbackCategory = "recommendation" | "financial" | "quality";

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ["recommendation", "financial", "quality"];

export const GENERIC_REASONS: Record<FeedbackVote, Record<FeedbackCategory, string[]>> = {
  up: {
    recommendation: [
      "Clear, actionable advice",
      "Matches my own assessment",
      "Helped me decide quickly",
    ],
    financial: ["Numbers look accurate", "Matches my own research", "Right level of detail"],
    quality: ["Comprehensive", "Easy to understand", "Looks up to date"],
  },
  down: {
    recommendation: [
      "Recommendation unclear or generic",
      "Doesn't match my assessment",
      "Missing important considerations",
    ],
    financial: ["Numbers seem inaccurate", "Missing cost items", "Assumptions don't fit my area"],
    quality: ["Information incomplete", "Confusing / hard to follow", "Looks outdated"],
  },
};

export interface SectionFeedbackConfig {
  label: string;
  categories: FeedbackCategory[];
}

export const SECTION_FEEDBACK_CONFIG: Record<string, SectionFeedbackConfig> = {
  "offer-plan": { label: "Offer Plan", categories: ["recommendation", "financial"] },
  photos: { label: "AI Photo Scan", categories: ["quality"] },
  floorplans: { label: "Floorplans", categories: ["quality"] },
  "hmo-layout": { label: "HMO Layout", categories: ["recommendation", "quality"] },
  "negotiation-playbook": {
    label: "Negotiation Playbook",
    categories: ["recommendation", "financial"],
  },
  "smart-negotiation": { label: "Smart Negotiation", categories: ["recommendation", "financial"] },
  "strategy-comparison": {
    label: "Strategy Comparison",
    categories: ["recommendation", "financial"],
  },
  "pf-signals": { label: "PF Signals", categories: ["quality"] },
  "market-comparables": { label: "Market Comparables", categories: ["financial", "quality"] },
  epc: { label: "EPC", categories: ["financial", "quality"] },
  survey: { label: "Survey Findings", categories: ["quality"] },
  "deal-sheet": { label: "Deal Sheet", categories: ["recommendation", "financial", "quality"] },
  "photos-scan": { label: "AI Photo Scan", categories: ["quality"] },
  "refurb-estimator": { label: "Refurb Estimator", categories: ["financial", "quality"] },
  "image-library": { label: "Image Library", categories: ["quality"] },
  "enrich-listing": { label: "Enrich Listing", categories: ["quality"] },
};

export function reasonsFor(sectionKey: string, vote: FeedbackVote): string[] {
  const config = SECTION_FEEDBACK_CONFIG[sectionKey];
  const categories = config?.categories ?? FEEDBACK_CATEGORIES;
  return categories.flatMap((c) => GENERIC_REASONS[vote][c]);
}

export function sectionLabelFor(sectionKey: string): string {
  return SECTION_FEEDBACK_CONFIG[sectionKey]?.label ?? sectionKey;
}
