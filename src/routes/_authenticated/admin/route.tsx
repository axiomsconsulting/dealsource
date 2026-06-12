import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) throw redirect({ to: "/auth" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    const role = profile?.role ?? "user";
    if (role !== "admin" && role !== "super_admin") throw redirect({ to: "/properties" });

    return { role: role as "admin" | "super_admin" };
  },
  component: () => <Outlet />,
});
