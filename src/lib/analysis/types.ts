import type { InvestorType } from "./lender-criteria";
import type { InsuranceEstimate } from "./insurance";
export type { InvestorType } from "./lender-criteria";
export type { InsuranceEstimate, InsuranceFactor } from "./insurance";
export type { SurveyIssue, SurveyIssueKey, SurveyFindings, SurveyFindingState, SurveySeverity } from "./survey-strategy";

export type StrategyKey = "BTL" | "BRRR" | "SA" | "HMO" | "FLIP" | "TITLE_SPLIT";

export interface PersonaInput {
  cash_available_gbp: number;
  target_rent_gbp: number;
  target_offer_gbp: number;
  max_offer_gbp: number;
  /** How this investor borrows — determines lender criteria (rate/LTV/stress test), not a number
   *  the investor sets directly. See `deriveLenderCriteria` in ./lender-criteria. */
  investor_type: InvestorType;
  refurb_buffer_gbp: number;
  min_beds: number;
  max_beds: number;
  min_epc: string;
  require_parking: boolean;
  require_gas_boiler: boolean;
  ignore_eras: string[];
}

export interface PropertyInput {
  address?: string | null;
  asking_price_gbp: number | null;
  beds: number | null;
  baths: number | null;
  area_sqm: number | null;
  epc_rate: string | null;
  property_type: string | null;
  tenure: string | null;
  postcode: string | null;
  lease_years_remaining?: number | null;
  estimated_rent_pcm?: number | null;
  rent_source?: string | null;
  article4_status?: string | null;
  risk_flags?: any;
  refurb_estimate?: any;
  image_urls?: string[] | null;
  pf_json?: any;
}

export interface SliderOverrides {
  offer_price?: number;
  monthly_rent?: number;
  refurb_cost?: number;
  mortgage_rate?: number;
  ltv?: number;
  arv?: number;          // After Refurb Value (for BRRR)
  room_count?: number;   // for HMO
  rent_per_room?: number;
  sa_nightly?: number;
  sa_occupancy?: number;
  /** GDV-based sourcing offer: openingOffer = ARV × (1 − profit%) − refurb − sourcing fee. */
  sourcingBufferEnabled?: boolean;
  /** Target post-refurb profit margin used by the sourcing buffer (fraction, e.g. 0.25 = 25%). */
  sourcingProfitPct?: number;
  /** Sourcing/packaging fee deducted by the sourcing buffer (£). */
  sourcingFeeGbp?: number;
}

export type OverrideKey = Exclude<keyof SliderOverrides, "sourcingBufferEnabled">;

// Slider bounds in DISPLAY units (i.e. the same scale the value is rendered at —
// percentages for "pct"-formatted numbers, raw £/counts otherwise).
export const OVERRIDE_BOUNDS: Record<OverrideKey, { min: number; max: number; step: number }> = {
  offer_price: { min: 50000, max: 500000, step: 500 },
  monthly_rent: { min: 400, max: 5000, step: 25 },
  refurb_cost: { min: 0, max: 100000, step: 500 },
  arv: { min: 50000, max: 600000, step: 1000 },
  mortgage_rate: { min: 2, max: 12, step: 0.05 },
  ltv: { min: 50, max: 85, step: 1 },
  room_count: { min: 2, max: 8, step: 1 },
  rent_per_room: { min: 300, max: 900, step: 5 },
  sa_nightly: { min: 50, max: 300, step: 5 },
  sa_occupancy: { min: 30, max: 95, step: 1 },
  sourcingProfitPct: { min: 10, max: 40, step: 1 },
  sourcingFeeGbp: { min: 0, max: 15000, step: 250 },
};

export interface StrategyNumber {
  label: string;
  value: number;
  format: "gbp" | "pct" | "num" | "months" | "count";
  hint?: string;
  /** Present when this cell is directly tunable via an inline slider. */
  overrideKey?: OverrideKey;
  /** Slider bounds, in display units (matches `format` scaling). */
  min?: number;
  max?: number;
  step?: number;
  /** What this value would be without any override — the "reset" target. */
  baseline?: number;
  /** True when the user (or another tuned input) has overridden this lever. */
  overridden?: boolean;
  /** Low/Medium/High spend tiers for this line item — same shape as
   *  `NegotiationPoint.specOptions`, used for AI-derived conversion costs (e.g. ensuites). */
  specOptions?: { rating: "L" | "M" | "H"; label: string; gbp: number }[];
}

/** One weighted line item behind a deal score — the sum of `points` across a strategy's
 *  `scoreBreakdown` (before the final 0-100 clamp) is the score shown for that strategy, so
 *  the number is reproducible by hand from the figures already on screen. */
export interface ScoreComponent {
  label: string;
  points: number;
  /** The cap this component is held to, if it has one — omitted when the component is
   *  uncapped on its own and only the strategy's overall 0-100 clamp applies. */
  max?: number;
  detail: string;
}

export interface StrategyResult {
  key: StrategyKey;
  name: string;
  feasible: boolean;
  reasons?: string[];
  numbers: StrategyNumber[];
  cashLeftIn?: number;
  monthlyCashflow?: number;
  annualROI?: number;
  dealScore: number; // 0-100
  /** The weighted components that sum to `dealScore` (pre-clamp) — what the score "is made of". */
  scoreBreakdown?: ScoreComponent[];
  /** One-line statement of the formula that combines `scoreBreakdown` into `dealScore`. */
  scoreFormula?: string;
  summary: string;
  /** AI-floor-plan-derived ensuite/self-contained-unit conversion economics — present only for
   *  HMO/SA when `ai_payload.hmoLayout` flags conversions, with the L/M/H spend tiers and the
   *  tier this strategy's headline numbers were computed at. */
  conversionOptions?: {
    /** AI's raw recommended count (ensuites for HMO, self-contained units for SA), before
     *  clamping to what this strategy can use. */
    aiRecommendedCount: number;
    /** Count actually applied to this strategy's numbers (clamped to room/unit count). */
    appliedCount: number;
    countLabel: string; // "ensuite conversions" | "self-contained unit conversions"
    options: {
      rating: "L" | "M" | "H";
      label: string;
      totalCostGbp: number;
      addedMonthlyRevenue: number;
      monthlyCashflow: number;
      annualROI: number;
    }[];
    /** The tier with the best annualROI — also the tier this strategy's headline numbers use. */
    recommendedRating: "L" | "M" | "H";
  };
}

/** A plain-language read on what the numbers mean — shown as badges alongside the deal score
 *  so "62/100" comes with "why" (risk level, income shape, upside potential). Each value is
 *  derived from figures already computed elsewhere in the analysis (see deriveDealIndicators). */
export interface DealIndicator {
  key: "risk" | "income" | "reward";
  label: string;
  value: string;
  tone: "good" | "neutral" | "warn" | "bad";
  detail: string;
}

/** How the headline 0-100 score was derived from the six strategy scores — lets the UI show
 *  the averaging (and any risk-flag cap) as plain arithmetic rather than a black box. */
export interface OverallScoreBreakdown {
  strategyScores: { key: StrategyKey; name: string; score: number }[];
  average: number;
  cappedAt?: number;
  capReason?: string;
}

export interface NegotiationPoint {
  category: "fault" | "leverage" | "improvement_gap" | "condition";
  title: string;
  description: string;
  gbp_impact: number;
  confidence: "low" | "medium" | "high";
  /** Low/Medium/High specification tiers for capex line items (e.g. EPC works) — lets the
   *  negotiation reflect that the same outcome can be reached at different spend levels. */
  specOptions?: { rating: "L" | "M" | "H"; label: string; gbp: number }[];
}

export interface NegotiationGuidance {
  askingPrice: number;
  openingOffer: number;
  targetOffer: number;
  walkAwayOffer: number;
  appliedLeverage: number;
  retainedLeverage: number;
  fullLeverage: number;
  credibleDiscountPct: number;
  maxOpeningDiscountPct: number;
  priceBand: string;
  stance: "light" | "standard" | "firm" | "survey-led";
  warnings: string[];
  /** Estimated cost to bring this property's EPC up to band C (MEES 2030 minimum for let
   *  properties), at the medium-spec figure — null if EPC is already C or better. This is
   *  also baked into `walkAwayOffer` as an additional ceiling reduction. */
  epcToCCost: number | null;
  /** GDV-based sourcing offer, present when `overrides.sourcingBufferEnabled` is set —
   *  shows the working behind the recomputed `openingOffer`. */
  sourcingBuffer?: {
    enabled: boolean;
    gdv: number;
    profitPct: number;
    sourcingFeeGbp: number;
    computedOffer: number;
  };
  /** Built-in-equity check at the target offer: does (GDV − all-in cost) leave the ~25% margin
   *  standard BRRR/refurbishment practice looks for (the level that lets a 75% LTV refinance
   *  return most/all capital, and gives a flip enough headroom to cover ~10% buy/hold/sell costs
   *  plus genuine profit)? `maxOfferForTargetEquity` is the highest price that still hits
   *  `targetEquityPct` given the same refurb/acquisition costs — a ceiling distinct from (and
   *  often below) the negotiation-evidence-based `walkAwayOffer`. */
  equityPlan?: {
    gdv: number;
    refurbCost: number;
    acquisitionCosts: number;
    targetEquityPct: number;
    totalCostAtTarget: number;
    equityAtTarget: number;
    equityPctAtTarget: number;
    meetsTarget: boolean;
    maxOfferForTargetEquity: number;
  };
}

export interface AnalysisOutput {
  personaMatch: { pass: boolean; reasons: string[] };
  effectiveInputs: {
    offer_price: number;
    monthly_rent: number;
    refurb_cost: number;
    mortgage_rate: number;
    ltv: number;
    stress_rate: number;
    arv: number;
    rent_source?: string;
    rent_trustworthy?: boolean;
    rent_range?: { low: number; mid: number; high: number; basis: string; evidence?: string[] } | null;
    refurb_source?: "algo" | "ai" | "persona_buffer" | "override";
    /** The lender criteria (rate/LTV/stress) derived from the criteria profile's investor type — see ./lender-criteria. */
    lender_criteria?: { mortgage_rate: number; ltv: number; stress_rate: number; icr_threshold: number; label: string; description: string };
  };
  strategies: StrategyResult[];
  negotiation: NegotiationPoint[];
  /** Sum of every weighted adjustment line item in `negotiation` (excludes the offer-plan anchor). */
  negotiationTotal: number;
  negotiationGuidance: NegotiationGuidance;
  bestStrategy: StrategyKey;
  overallScore: number;
  overallScoreBreakdown: OverallScoreBreakdown;
  dealIndicators: DealIndicator[];
  riskFlags?: any[];
  article4?: { status: string; council: string | null } | null;
  /** Estimated landlord buildings-insurance premium for the lead strategy — see ./insurance. */
  insurance: InsuranceEstimate;
}
