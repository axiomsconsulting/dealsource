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
