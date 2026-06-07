export type StrategyKey = "BTL" | "BRRR" | "SA" | "HMO" | "FLIP" | "TITLE_SPLIT";

export interface PersonaInput {
  cash_available_gbp: number;
  target_rent_gbp: number;
  target_offer_gbp: number;
  max_offer_gbp: number;
  mortgage_rate: number;
  stress_rate: number;
  ltv: number;
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

export interface StrategyResult {
  key: StrategyKey;
  name: string;
  feasible: boolean;
  reasons?: string[];
  numbers: { label: string; value: number; format: "gbp" | "pct" | "num" | "months"; hint?: string }[];
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
}

export interface AnalysisOutput {
  personaMatch: { pass: boolean; reasons: string[] };
  effectiveInputs: {
    offer_price: number;
    monthly_rent: number;
    refurb_cost: number;
    mortgage_rate: number;
    ltv: number;
    arv: number;
    rent_source?: string;
    rent_trustworthy?: boolean;
    refurb_source?: "algo" | "ai" | "persona_buffer" | "override";
  };
  strategies: StrategyResult[];
  negotiation: NegotiationPoint[];
  bestStrategy: StrategyKey;
  overallScore: number;
  riskFlags?: any[];
  article4?: { status: string; council: string | null } | null;
}