import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Schema = z.object({
  name: z.string().min(1).max(120),
  postcode_prefix: z.string().max(20).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  min_beds: z.number().int().min(0).max(20).nullable().optional(),
  max_beds: z.number().int().min(0).max(20).nullable().optional(),
  min_price: z.number().min(0).nullable().optional(),
  max_price: z.number().min(0).nullable().optional(),
  min_deal_score: z.number().int().min(0).max(100).default(60),
  notify_email: z.string().email().max(200).nullable().optional(),
  frequency: z.enum(["daily", "weekly", "off"]).default("daily"),
  is_active: z.boolean().default(true),
});

export const listSavedSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("saved_searches").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Schema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("saved_searches").insert({ ...data, user_id: context.userId }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), patch: Schema.partial() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("saved_searches").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("saved_searches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runSavedSearchPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase.from("saved_searches").select("*").eq("id", data.id).maybeSingle();
    if (!s) throw new Error("Search not found");
    let q = context.supabase.from("properties").select("*");
    if (s.postcode_prefix) q = q.ilike("postcode", `${s.postcode_prefix}%`);
    if (s.city) q = q.ilike("city", `%${s.city}%`);
    if (s.min_beds != null) q = q.gte("beds", s.min_beds);
    if (s.max_beds != null) q = q.lte("beds", s.max_beds);
    if (s.min_price != null) q = q.gte("asking_price_gbp", s.min_price);
    if (s.max_price != null) q = q.lte("asking_price_gbp", s.max_price);
    const { data: props, error } = await q.limit(200);
    if (error) throw new Error(error.message);
    return props ?? [];
  });