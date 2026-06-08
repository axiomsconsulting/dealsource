import { Link, useRouter } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, LogOut, Sliders, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";
import { AppFooter } from "@/components/AppFooter";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center">
            <img src="/omnispace-logo.png" alt="Deal Negotiator — Omnispace Estates" className="h-9 w-auto" />
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/dashboard" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <LayoutDashboard className="h-4 w-4" /> Ingest
            </Link>
            <Link to="/properties" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <ListChecks className="h-4 w-4" /> Properties
            </Link>
            <Link to="/searches" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <Bell className="h-4 w-4" /> Searches
            </Link>
            <Link to="/persona" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <Sliders className="h-4 w-4" /> Criteria
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
      <main className="container mx-auto flex-1 px-6 py-8">
        {title && <h1 className="mb-6 text-2xl font-bold tracking-tight">{title}</h1>}
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
