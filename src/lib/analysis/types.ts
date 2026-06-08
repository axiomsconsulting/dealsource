import type { InvestorType } from "./lender-criteria";
export type { InvestorType } from "./lender-criteria";

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
}

export type OverrideKey = keyof SliderOverrides;

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
  summary: string;
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
    lender_criteria?: { mortgage_rate: number; ltv: number; stress_rate: number; label: string; description: string };
  };
  strategies: StrategyResult[];
  negotiation: NegotiationPoint[];
  /** Sum of every weighted adjustment line item in `negotiation` (excludes the offer-plan anchor). */
  negotiationTotal: number;
  negotiationGuidance: NegotiationGuidance;
  bestStrategy: StrategyKey;
  overallScore: number;
  riskFlags?: any[];
  article4?: { status: string; council: string | null } | null;
}
