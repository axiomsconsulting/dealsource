import { PLANS, PRICES, TOPUP_CREDITS, type FeatureKey, type PaidPlan } from "./plans";

export interface CalcInput {
  properties: number;
  aiPerMonth: number;
  features: Partial<Record<FeatureKey, boolean>>;
  seats?: number;
}

export interface CalcResult {
  plan: PaidPlan;
  basePence: number;
  topups: number;
  monthlyPence: number;
  annualPence: number;
}

const ORDER: PaidPlan[] = ["starter", "investor", "pro"];

/** Cheapest plan meeting features/properties/seats; extra AI bought as £5/50 top-ups. */
export function recommendPlan(input: CalcInput): CalcResult {
  const candidates = ORDER.filter((k) => {
    const p = PLANS[k];
    if (input.properties > p.maxProperties) return false;
    if ((input.seats ?? 1) > p.seats) return false;
    return (Object.keys(input.features) as FeatureKey[]).every((f) => !input.features[f] || p.features[f]);
  });
  const pool = candidates.length ? candidates : (["pro"] as PaidPlan[]);
  let best: CalcResult | null = null;
  for (const k of pool) {
    const over = Math.max(0, input.aiPerMonth - PLANS[k].aiPerPeriod);
    const topups = Math.ceil(over / TOPUP_CREDITS);
    const monthly = PRICES[k].month + topups * PRICES.topup50;
    const r: CalcResult = { plan: k, basePence: PRICES[k].month, topups, monthlyPence: monthly, annualPence: PRICES[k].year + topups * PRICES.topup50 * 12 };
    if (!best || r.monthlyPence < best.monthlyPence) best = r;
  }
  return best!;
}
