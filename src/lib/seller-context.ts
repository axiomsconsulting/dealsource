export interface SellerCircumstance {
  key: string;
  label: string;
  // % of asking that this circumstance typically unlocks (positive = more flex)
  flexPct: number;
  hint: string;
}

export const SELLER_CIRCUMSTANCES: SellerCircumstance[] = [
  { key: "probate",            label: "Probate sale",                   flexPct: 0.05, hint: "Executors want speed and certainty over top price." },
  { key: "divorce",             label: "Divorce / separation",          flexPct: 0.03, hint: "Joint vendors under pressure to settle quickly." },
  { key: "negative_equity",     label: "Negative equity",               flexPct: -0.02, hint: "Vendor can't drop below mortgage redemption — constrains flex." },
  { key: "chain_break",         label: "Chain has broken",              flexPct: 0.04, hint: "Vendor likely to lose onward purchase — speed > price." },
  { key: "relocation",          label: "Job relocation",                flexPct: 0.025, hint: "Deadline-driven move; will trade price for certainty." },
  { key: "downsizing",          label: "Downsizing / outgrown",         flexPct: 0.02, hint: "Less price-sensitive, more lifestyle-driven." },
  { key: "elderly_owner",       label: "Elderly owner / care home",     flexPct: 0.04, hint: "Family wants tidy exit; chain-free quick sale prized." },
  { key: "children_moved_away", label: "Children have moved away",      flexPct: 0.015, hint: "Lifestyle motivator; modest extra flex." },
  { key: "family_difficulty",   label: "Family difficulty / bereavement", flexPct: 0.035, hint: "Emotional pressure; sensitivity + cash offer wins." },
  { key: "financial_distress",  label: "Financial distress",            flexPct: 0.06, hint: "Repossession risk — cash + speed dominant." },
  { key: "landlord_exiting",    label: "Landlord exiting (Section 24)", flexPct: 0.04, hint: "Selling for tax reasons — often portfolio sellers, motivated." },
  { key: "tenant_in_situ",      label: "Tenant in situ",                flexPct: 0.05, hint: "Limits buyer pool to investors — discount typically offered." },
  { key: "long_on_market",      label: "Long time on market (>120d)",   flexPct: 0.05, hint: "Vendor fatigue; price has been re-tested by the market." },
  { key: "multiple_reductions", label: "Multiple price reductions",     flexPct: 0.03, hint: "Vendor already psychologically primed to drop further." },
  { key: "back_on_market",      label: "Back on market after fall-through", flexPct: 0.04, hint: "Second time around; cash + speed will be welcomed." },
];

export interface SellerContext {
  circumstances?: Record<string, { active: boolean; note?: string }>;
  notes?: string;
}

export function circumstanceFlexPct(ctx: SellerContext | null | undefined): number {
  if (!ctx?.circumstances) return 0;
  let total = 0;
  for (const c of SELLER_CIRCUMSTANCES) {
    if (ctx.circumstances[c.key]?.active) total += c.flexPct;
  }
  // cap combined flex at ±15%
  return Math.max(-0.15, Math.min(0.15, total));
}