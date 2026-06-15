import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listFeedback = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("feedback")
      .select("*, properties(address, postcode), profiles(email, display_name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, role, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listUsersWithStats = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async () => {
    const { data: users, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, role, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: properties } = await supabaseAdmin.from("properties").select("user_id");
    const { data: logins } = await supabaseAdmin
      .from("login_events")
      .select("user_id, created_at")
      .order("created_at", { ascending: false });

    const propertyCounts = new Map<string, number>();
    for (const p of properties ?? []) {
      propertyCounts.set(p.user_id, (propertyCounts.get(p.user_id) ?? 0) + 1);
    }
    const lastLogin = new Map<string, string>();
    for (const l of logins ?? []) {
      if (!lastLogin.has(l.user_id)) lastLogin.set(l.user_id, l.created_at);
    }

    return (users ?? []).map((u) => ({
      ...u,
      properties_count: propertyCounts.get(u.id) ?? 0,
      last_login_at: lastLogin.get(u.id) ?? null,
    }));
  });

export const getUserInsights = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, role, created_at")
      .eq("id", data.userId)
      .single();
    if (profileError || !profile) throw new Error("User not found");

    const { data: properties } = await supabaseAdmin
      .from("properties")
      .select("id, address, postcode, created_at, asking_price_gbp")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false });

    const { data: aiUsage } = await supabaseAdmin
      .from("ai_usage_log")
      .select("feature_key")
      .eq("user_id", data.userId);
    const aiUsageCounts = new Map<string, number>();
    for (const row of aiUsage ?? []) {
      aiUsageCounts.set(row.feature_key, (aiUsageCounts.get(row.feature_key) ?? 0) + 1);
    }

    const { data: logins } = await supabaseAdmin
      .from("login_events")
      .select("created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false });
    const loginDates = (logins ?? []).map((l) => new Date(l.created_at));

    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const countSince = (hours: number) => loginDates.filter((d) => now - d.getTime() <= hours * HOUR).length;

    const dailyCounts = new Map<string, number>();
    for (const d of loginDates) {
      const key = d.toISOString().slice(0, 10);
      dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
    }
    const loginSeries: { date: string; logins: number }[] = [];
    for (let i = 89; i >= 0; i--) {
      const day = new Date(now - i * 24 * HOUR);
      const key = day.toISOString().slice(0, 10);
      loginSeries.push({ date: key, logins: dailyCounts.get(key) ?? 0 });
    }

    return {
      profile,
      properties: properties ?? [],
      aiUsage: Array.from(aiUsageCounts.entries()).map(([feature_key, count]) => ({ feature_key, count })),
      loginStats: {
        last_login_at: loginDates[0]?.toISOString() ?? null,
        last24h: countSince(24),
        last7d: countSince(24 * 7),
        last30d: countSince(24 * 30),
        last90d: countSince(24 * 90),
        series: loginSeries,
      },
    };
  });

export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (context.role !== "super_admin")
      throw new Error("Forbidden: only super admins can switch accounts");
    if (data.userId === context.userId) throw new Error("You are already viewing your own account");

    const { data: target, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("email, role")
      .eq("id", data.userId)
      .single();
    if (targetError || !target?.email) throw new Error("User not found");
    if (target.role === "super_admin") throw new Error("Cannot impersonate another super admin");

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: context.userId,
      target_user_id: data.userId,
      action: "impersonate_start",
    });

    return { tokenHash: link.properties.hashed_token, email: target.email };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (context.role !== "super_admin")
      throw new Error("Forbidden: only super admins can delete users");
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");

    const { data: target, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", data.userId)
      .single();
    if (targetError || !target) throw new Error("User not found");
    if (target.role === "super_admin") throw new Error("Cannot delete a super admin");

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ userId: z.string().uuid(), role: z.enum(["user", "admin", "super_admin"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (context.role !== "super_admin")
      throw new Error("Forbidden: only super admins can change roles");

    const { data: target, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", data.userId)
      .single();
    if (targetError || !target) throw new Error("User not found");
    if (target.role === "super_admin") throw new Error("Cannot change the role of a super admin");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ role: data.role })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
