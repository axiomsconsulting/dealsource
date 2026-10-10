// Shared (client + server) source of truth for plans. Keep in sync with SQL public.plan_limits.
export type PlanKey = "none" | "trial" | "starter" | "investor" | "pro";
export type FeatureKey = "photoRefurbAI" | "bulkAI" | "privacyPdf" | "whiteLabel";

export interface PlanDef {
  label: string;
  maxProperties: number;
  aiPerPeriod: number;
  maxPersonas: number;
  seats: number;
  features: Record<FeatureKey, boolean>;
}

export const PLANS: Record<PlanKey, PlanDef> = {
  none: { label: "No plan", maxProperties: 0, aiPerPeriod: 0, maxPersonas: 0, seats: 1, features: { photoRefurbAI: false, bulkAI: false, privacyPdf: false, whiteLabel: false } },
  trial: { label: "Free trial", maxProperties: 10, aiPerPeriod: 10, maxPersonas: 5, seats: 1, features: { photoRefurbAI: true, bulkAI: true, privacyPdf: true, whiteLabel: false } },
  starter: { label: "Starter", maxProperties: 25, aiPerPeriod: 25, maxPersonas: 1, seats: 1, features: { photoRefurbAI: false, bulkAI: false, privacyPdf: false, whiteLabel: false } },
  investor: { label: "Investor", maxProperties: 150, aiPerPeriod: 150, maxPersonas: 5, seats: 1, features: { photoRefurbAI: true, bulkAI: true, privacyPdf: true, whiteLabel: false } },
  pro: { label: "Pro", maxProperties: 750, aiPerPeriod: 750, maxPersonas: 50, seats: 3, features: { photoRefurbAI: true, bulkAI: true, privacyPdf: true, whiteLabel: true } },
};

export type PaidPlan = "starter" | "investor" | "pro";
export type Interval = "month" | "year";

/** Pence, VAT inclusive. */
export const PRICES = {
  starter: { month: 900, year: 9000 },
  investor: { month: 2900, year: 29000 },
  pro: { month: 7900, year: 79000 },
  topup50: 500,
} as const;

export const METERED_FEATURES = new Set(["full_analysis", "refurb_photos", "hmo_layout", "viewing_issue_photos"]);
export const TOPUP_CREDITS = 50;
export const TRIAL_DAYS = 14;

export const lookupKey = (plan: PaidPlan, interval: Interval) => `dn_${plan}_${interval}`;
export const TOPUP_LOOKUP_KEY = "dn_topup_50";
