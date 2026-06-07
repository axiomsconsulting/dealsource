import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PRESETS: Array<{ name: string; strategy: string; patch: Record<string, any> }> = [
  {
    name: "Cashflow BTL — £60k",
    strategy: "BTL",
    patch: { cash_available_gbp: 60000, target_rent_gbp: 1200, target_offer_gbp: 150000, max_offer_gbp: 180000, ltv: 0.75, mortgage_rate: 0.055, refurb_buffer_gbp: 12000, min_beds: 3, max_beds: 4 },
  },
  {
    name: "BRRR Recycler — £80k",
    strategy: "BRRR",
    patch: { cash_available_gbp: 80000, target_rent_gbp: 1100, target_offer_gbp: 120000, max_offer_gbp: 160000, ltv: 0.75, mortgage_rate: 0.058, refurb_buffer_gbp: 35000, min_beds: 2, max_beds: 4 },
  },
  {
    name: "SA Operator — city centre",
    strategy: "SA",
    patch: { cash_available_gbp: 100000, target_rent_gbp: 1600, target_offer_gbp: 180000, max_offer_gbp: 230000, ltv: 0.70, mortgage_rate: 0.065, refurb_buffer_gbp: 25000, min_beds: 1, max_beds: 3, require_parking: false },
  },
  {
    name: "HMO Operator — 5–6 bed",
    strategy: "HMO",
    patch: { cash_available_gbp: 120000, target_rent_gbp: 2800, target_offer_gbp: 200000, max_offer_gbp: 260000, ltv: 0.75, mortgage_rate: 0.065, refurb_buffer_gbp: 30000, min_beds: 4, max_beds: 6 },
  },
  {
    name: "Flipper — 20% margin",
    strategy: "FLIP",
    patch: { cash_available_gbp: 90000, target_rent_gbp: 1000, target_offer_gbp: 130000, max_offer_gbp: 170000, ltv: 0.0, mortgage_rate: 0.10, refurb_buffer_gbp: 35000, min_beds: 2, max_beds: 4 },
  },
];

async function seedPresetsIfEmpty(ctx: any) {
  const { data: any_row } = await ctx.supabase.from("personas").select("id").eq("user_id", ctx.userId).limit(1).maybeSingle();
  if (any_row) return;
  const rows = PRESETS.map((p, i) => ({
    user_id: ctx.userId,
    name: p.name,
    strategy: p.strategy,
    is_default: i === 0,
    ...p.patch,
  }));
  await ctx.supabase.from("personas").insert(rows);
}

export const getOrCreateDefaultPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await seedPresetsIfEmpty(context);
    const { data: existing } = await context.supabase
      .from("personas")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_default", true)
      .maybeSingle();
    if (existing) return existing;
    // promote first persona to default
    const { data: first } = await context.supabase
      .from("personas").select("*").eq("user_id", context.userId).order("created_at").limit(1).maybeSingle();
    if (first) {
      await context.supabase.from("personas").update({ is_default: true }).eq("id", first.id);
      return { ...first, is_default: true };
    }
    const { data: created, error } = await context.supabase
      .from("personas")
      .insert({
        user_id: context.userId,
        name: "BTL Investor — £60k",
        strategy: "BTL",
        is_default: true,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const listPersonas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await seedPresetsIfEmpty(context);
    const { data, error } = await context.supabase
      .from("personas").select("*").eq("user_id", context.userId).order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const StrategyEnum = z.enum(["BTL", "BRRR", "SA", "HMO", "FLIP", "TITLE_SPLIT", "CUSTOM"]);

export const createPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    name: z.string().min(1).max(120),
    strategy: StrategyEnum.default("BTL"),
    copyFromId: z.string().uuid().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    let base: any = { user_id: context.userId, name: data.name, strategy: data.strategy, is_default: false };
    if (data.copyFromId) {
      const { data: src } = await context.supabase.from("personas").select("*").eq("id", data.copyFromId).eq("user_id", context.userId).maybeSingle();
      if (src) {
        const { id, created_at, updated_at, is_default, name, strategy, ...rest } = src as any;
        base = { ...rest, ...base };
      }
    }
    const { data: row, error } = await context.supabase.from("personas").insert(base).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("personas").select("is_default").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    const { error } = await context.supabase.from("personas").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (row?.is_default) {
      const { data: next } = await context.supabase.from("personas").select("id").eq("user_id", context.userId).order("created_at").limit(1).maybeSingle();
      if (next) await context.supabase.from("personas").update({ is_default: true }).eq("id", next.id);
    }
    return { ok: true };
  });

export const setActivePersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase.from("personas").update({ is_default: false }).eq("user_id", context.userId).eq("is_default", true);
    const { error } = await context.supabase.from("personas").update({ is_default: true }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PersonaPatchSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(),
  strategy: StrategyEnum.optional(),
  cash_available_gbp: z.number().min(0).max(10_000_000).optional(),
  target_rent_gbp: z.number().min(0).max(20000).optional(),
  max_offer_gbp: z.number().min(0).max(10_000_000).optional(),
  target_offer_gbp: z.number().min(0).max(10_000_000).optional(),
  mortgage_rate: z.number().min(0).max(0.3).optional(),
  stress_rate: z.number().min(0).max(0.3).optional(),
  ltv: z.number().min(0).max(0.95).optional(),
  refurb_buffer_gbp: z.number().min(0).max(500000).optional(),
  ai_default_enabled: z.boolean().optional(),
  min_beds: z.number().int().min(0).max(20).optional(),
  max_beds: z.number().int().min(0).max(20).optional(),
  min_epc: z.string().max(2).optional(),
  require_parking: z.boolean().optional(),
  require_gas_boiler: z.boolean().optional(),
  risk_policy: z.record(z.enum(["hide", "deprioritise", "show"])).optional(),
});

export const updateDefaultPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PersonaPatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const q = context.supabase.from("personas").update(patch).eq("user_id", context.userId);
    const { error } = id ? await q.eq("id", id) : await q.eq("is_default", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });