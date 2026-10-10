import type { SupabaseClient } from "@supabase/supabase-js";
import { METERED_FEATURES, PLANS, type FeatureKey, type PlanKey } from "./plans";

export class BillingError extends Error {
  code: string;
  meta: Record<string, unknown>;
  constructor(code: string, meta: Record<string, unknown> = {}) {
    super(JSON.stringify({ billing: code, ...meta }));
    this.code = code;
    this.meta = meta;
  }
}

type Ctx = { supabase: SupabaseClient<any>; userId: string };

async function enforced(sb: SupabaseClient<any>): Promise<boolean> {
  if (process.env.BILLING_ENFORCED === "true") return true;
  const { data } = await sb.from("app_settings").select("value").eq("key", "billing_enforced").maybeSingle();
  return data?.value === true || data?.value === "true";
}

export async function getEntitlements(sb: SupabaseClient<any>, userId: string) {
  const [{ data: plan }, { data: profile }] = await Promise.all([
    sb.rpc("effective_plan" as any, { _uid: userId }),
    sb.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  const { data: owner } = await sb.rpc("billing_owner" as any, { _uid: userId });
  const ownerId = (owner as string) ?? userId;
  const { data: sub } = await sb.from("subscriptions" as any).select("*").eq("user_id", ownerId).maybeSingle();
  const { data: usage } = await sb
    .from("usage_periods" as any)
    .select("ai_used, period_start, period_end")
    .eq("owner_user_id", ownerId)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count } = await sb.from("properties").select("id", { count: "exact", head: true }).eq("hidden", false);
  const key = ((plan as string) ?? "none") as PlanKey;
  const def = PLANS[key] ?? PLANS.none;
  const s = sub as any;
  const u = usage as any;
  const usageCurrent = u && new Date(u.period_end) > new Date() ? u.ai_used : 0;
  return {
    plan: key,
    status: s?.status ?? "none",
    trialEndsAt: s?.trial_ends_at ?? null,
    periodEnd: s?.current_period_end ?? null,
    cancelAtPeriodEnd: !!s?.cancel_at_period_end,
    isOwner: ownerId === userId,
    limits: { maxProperties: def.maxProperties, aiPerPeriod: def.aiPerPeriod, maxPersonas: def.maxPersonas, seats: def.seats },
    features: def.features,
    usage: { properties: count ?? 0, aiUsed: usageCurrent, aiLimit: def.aiPerPeriod, topup: s?.topup_credits ?? 0 },
    isAdmin: profile?.role === "admin" || profile?.role === "super_admin" || !!s?.comp,
    enforced: await enforced(sb),
  };
}

export async function assertCanAddProperties(ctx: Ctx, n: number) {
  const e = await getEntitlements(ctx.supabase, ctx.userId);
  if (e.isAdmin || !e.enforced) return e;
  if (e.usage.properties + n > e.limits.maxProperties) {
    throw new BillingError("PROPERTY_LIMIT_REACHED", { limit: e.limits.maxProperties, current: e.usage.properties });
  }
  return e;
}

export async function assertFeature(ctx: Ctx, f: FeatureKey) {
  const e = await getEntitlements(ctx.supabase, ctx.userId);
  if (e.isAdmin || !e.enforced) return;
  if (!e.features[f]) throw new BillingError(f === "whiteLabel" ? "FEATURE_REQUIRES_PRO" : "FEATURE_REQUIRES_INVESTOR", { feature: f });
}

/** Consumes one credit for metered features. Returns a refund fn. */
export async function consumeAi(ctx: Ctx, featureKey: string): Promise<() => Promise<void>> {
  const noop = async () => {};
  if (!METERED_FEATURES.has(featureKey)) return noop;
  const { data, error } = await ctx.supabase.rpc("consume_ai_credits" as any, { n: 1 });
  if (error) throw mapDbError(error) ?? error;
  const r = data as any;
  if (!r?.period_start) return noop;
  return async () => {
    await ctx.supabase.rpc("refund_ai_credits" as any, { n: 1, from_topup: r.from_topup ?? 0, _period_start: r.period_start });
  };
}

export function mapDbError(err: { message?: string } | null | undefined): BillingError | null {
  const m = /(PROPERTY_LIMIT_REACHED|AI_LIMIT_REACHED):(\d+)/.exec(err?.message ?? "");
  return m ? new BillingError(m[1], { limit: Number(m[2]) }) : null;
}

/** Throws AI_LIMIT_REACHED before spending if the user has no credits left. */
export async function aiPreflight(ctx: Ctx) {
  const e = await getEntitlements(ctx.supabase, ctx.userId);
  if (e.isAdmin || !e.enforced) return;
  if (e.usage.aiUsed >= e.usage.aiLimit && e.usage.topup <= 0) {
    throw new Error("You've used all your AI credits for this period. Buy a top-up or upgrade your plan on the Pricing page.");
  }
}
