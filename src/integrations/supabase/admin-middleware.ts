import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

export const requireAdminAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .single();

    if (error || !data || !["admin", "super_admin"].includes(data.role)) {
      throw new Error("Forbidden: admin access required");
    }

    return next({
      context: { ...context, role: data.role as "admin" | "super_admin" },
    });
  });
