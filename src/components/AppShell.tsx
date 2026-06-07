import { Link, useRouter } from "@tanstack/react-router";
import { Building2, LayoutDashboard, ListChecks, LogOut, Sliders } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-2 text-lg font-semibold">
            <Building2 className="h-6 w-6 text-primary" />
            Deal Sourcer
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/dashboard" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <LayoutDashboard className="h-4 w-4" /> Ingest
            </Link>
            <Link to="/properties" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <ListChecks className="h-4 w-4" /> Properties
            </Link>
            <Link to="/persona" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <Sliders className="h-4 w-4" /> Persona
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.navigate({ to: "/auth" });
              }}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-6 py-8">
        {title && <h1 className="mb-6 text-2xl font-bold tracking-tight">{title}</h1>}
        {children}
      </main>
    </div>
  );
}