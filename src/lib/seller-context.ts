import type { PropertyInput } from "./analysis/types";
import { textPool } from "./analysis/risk";

export interface SellerCircumstance {
  key: string;
  label: string;
  // % of asking that this circumstance typically unlocks (positive = more flex)
  flexPct: number;
  hint: string;
}

export const SELLER_CIRCUMSTANCES: SellerCircumstance[] = [
  {
    key: "probate",
    label: "Probate sale",
    flexPct: 0.05,
    hint: "Executors want speed and certainty over top price.",
  },
  {
    key: "divorce",
    label: "Divorce / separation",
    flexPct: 0.03,
    hint: "Joint vendors under pressure to settle quickly.",
  },
  {
    key: "negative_equity",
    label: "Negative equity",
    flexPct: -0.02,
    hint: "Vendor can't drop below mortgage redemption — constrains flex.",
  },
  {
    key: "chain_break",
    label: "Chain has broken",
    flexPct: 0.04,
    hint: "Vendor likely to lose onward purchase — speed > price.",
  },
  {
    key: "relocation",
    label: "Job relocation",
    flexPct: 0.025,
    hint: "Deadline-driven move; will trade price for certainty.",
  },
  {
    key: "downsizing",
    label: "Downsizing / outgrown",
    flexPct: 0.02,
    hint: "Less price-sensitive, more lifestyle-driven.",
  },
  {
    key: "elderly_owner",
    label: "Elderly owner / care home",
    flexPct: 0.04,
    hint: "Family wants tidy exit; chain-free quick sale prized.",
  },
  {
    key: "children_moved_away",
    label: "Children have moved away",
    flexPct: 0.015,
    hint: "Lifestyle motivator; modest extra flex.",
  },
  {
    key: "family_difficulty",
    label: "Family difficulty / bereavement",
    flexPct: 0.035,
    hint: "Emotional pressure; sensitivity + cash offer wins.",
  },
  {
    key: "financial_distress",
    label: "Financial distress",
    flexPct: 0.06,
    hint: "Repossession risk — cash + speed dominant.",
  },
  {
    key: "landlord_exiting",
    label: "Landlord exiting (Section 24)",
    flexPct: 0.04,
    hint: "Selling for tax reasons — often portfolio sellers, motivated.",
  },
  {
    key: "tenant_in_situ",
    label: "Tenant in situ",
    flexPct: 0.05,
    hint: "Limits buyer pool to investors — discount typically offered.",
  },
  {
    key: "long_on_market",
    label: "Long time on market (>120d)",
    flexPct: 0.05,
    hint: "Vendor fatigue; price has been re-tested by the market.",
  },
  {
    key: "multiple_reductions",
    label: "Multiple price reductions",
    flexPct: 0.03,
    hint: "Vendor already psychologically primed to drop further.",
  },
  {
    key: "back_on_market",
    label: "Back on market after fall-through",
    flexPct: 0.04,
    hint: "Second time around; cash + speed will be welcomed.",
  },
];

export interface SellerContext {
  circumstances?: Record<string, { active: boolean; note?: string }>;
  notes?: string;
  /** AI-comparables flex estimate from "AI comparables" — folded into negotiation guidance
   *  alongside circumstanceFlexPct so it persists and recomputes live, not just locally. */
  aiFlex?: { reductionPctMid: number; fetchedAt: string };
}

// Keyword signals from the listing description/keywords that suggest a given seller
// circumstance. Deliberately conservative — these only PRE-TICK boxes for the user to confirm
// or remove, they never get persisted as "confirmed" without the user keeping them ticked.
const CIRCUMSTANCE_SIGNALS: Record<string, RegExp> = {
  probate: /\bprobate\b|\bdeceased\b|\bexecutors?\b|estate of the late/i,
  divorce: /\bdivorce\b|\bseparation\b|marital split/i,
  negative_equity: /negative equity/i,
  chain_break:
    /chain[\s-]?free|no\s+(onward\s+)?chain|chain\s+has\s+(broken|fallen through)|sale\s+fell\s+through/i,
  relocation: /relocat|moving\s+(abroad|overseas|away)|emigrat/i,
  downsizing: /downsiz/i,
  elderly_owner: /elderly|care\s+home|retirement\s+(home|village)|sheltered\s+housing/i,
  children_moved_away: /children\s+(have\s+)?(moved|grown up and (moved|left))|empty\s+nest/i,
  family_difficulty: /bereavement|passed\s+away|family\s+(circumstances|difficulties)/i,
  financial_distress: /repossession|mortgage\s+arrears|in\s+arrears|financial\s+difficult/i,
  landlord_exiting:
    /landlord\s+(is\s+)?(selling|exiting)|portfolio\s+sale|section\s+24|exiting\s+(the\s+)?(buy-?to-?let|rental)\s+market/i,
  tenant_in_situ:
    /tenant\s+in\s+situ|sold\s+with\s+(a\s+)?tenant|tenanted\s+investment|currently\s+tenanted/i,
};

/** Scans the property's listing text/keywords (and a couple of structured Property Filter
 *  fields) for signals matching `SELLER_CIRCUMSTANCES`, returning a partial circumstances map
 *  suitable as a starting point for `SellerContext.circumstances` — i.e. boxes the user can
 *  review, keep ticked or untick, rather than facts asserted on their behalf. */
export function inferSellerCircumstances(
  prop: PropertyInput,
): Record<string, { active: boolean; note?: string }> {
  const out: Record<string, { active: boolean; note?: string }> = {};
  const text = textPool(prop);

  for (const [key, re] of Object.entries(CIRCUMSTANCE_SIGNALS)) {
    if (re.test(text))
      out[key] = { active: true, note: "Inferred from listing description — review and confirm." };
  }

  const pf = prop.pf_json?.propertyLight ?? {};
  if (typeof pf.multipleReduce === "number" && pf.multipleReduce >= 2) {
    out.multiple_reductions = {
      active: true,
      note: `${pf.multipleReduce} price reduction(s) recorded — inferred from listing data.`,
    };
  }
  if (typeof pf.multipleBack === "number" && pf.multipleBack >= 2) {
    out.back_on_market = {
      active: true,
      note: `Back on market ${pf.multipleBack}× — inferred from listing data.`,
    };
  }

  return out;
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
