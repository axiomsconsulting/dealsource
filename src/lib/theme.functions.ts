import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const ThemeColorsSchema = z.record(z.string(), z.string());

export const getActiveTheme = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabasePublic = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabasePublic
      .from("design_themes")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const listThemes = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("design_themes")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTheme = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z.object({
      name: z.string().min(1).max(80),
      radius: z.string().min(1).max(20),
      fontScale: z.number().min(0.75).max(1.5),
      light: ThemeColorsSchema,
      dark: ThemeColorsSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("design_themes")
      .insert({
        name: data.name,
        radius: data.radius,
        font_scale: data.fontScale,
        light: data.light,
        dark: data.dark,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateTheme = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80),
      radius: z.string().min(1).max(20),
      fontScale: z.number().min(0.75).max(1.5),
      light: ThemeColorsSchema,
      dark: ThemeColorsSchema,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("design_themes")
      .update({
        name: data.name,
        radius: data.radius,
        font_scale: data.fontScale,
        light: data.light,
        dark: data.dark,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setActiveTheme = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error: clearError } = await context.supabase
      .from("design_themes")
      .update({ is_active: false })
      .eq("is_active", true);
    if (clearError) throw new Error(clearError.message);

    const { error } = await context.supabase
      .from("design_themes")
      .update({ is_active: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTheme = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("design_themes")
      .select("is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.is_active) throw new Error("Cannot delete the active theme — activate another theme first");

    const { error } = await context.supabase.from("design_themes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
