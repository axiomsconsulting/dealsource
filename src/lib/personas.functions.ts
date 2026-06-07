import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getOrCreateDefaultPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing } = await context.supabase
      .from("personas")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_default", true)
      .maybeSingle();
    if (existing) return existing;
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

const PersonaPatchSchema = z.object({
  cash_available_gbp: z.number().min(0).max(10_000_000).optional(),
  target_rent_gbp: z.number().min(0).max(20000).optional(),
  max_offer_gbp: z.number().min(0).max(10_000_000).optional(),
  target_offer_gbp: z.number().min(0).max(10_000_000).optional(),
  mortgage_rate: z.number().min(0).max(0.3).optional(),
  stress_rate: z.number().min(0).max(0.3).optional(),
  ltv: z.number().min(0).max(0.95).optional(),
  refurb_buffer_gbp: z.number().min(0).max(500000).optional(),
  ai_default_enabled: z.boolean().optional(),
});

export const updateDefaultPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PersonaPatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("personas")
      .update(data)
      .eq("user_id", context.userId)
      .eq("is_default", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });