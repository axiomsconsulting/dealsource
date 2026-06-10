import { Link, useRouter } from "@tanstack/react-router";
import { PlusCircle, ListChecks, LogOut, Sliders, Bell, Home, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";
import { AppFooter } from "@/components/AppFooter";
import { AddPropertyDialog } from "@/components/AddPropertyDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALL_STRATEGY_KEYS, STRATEGY_LABELS, useStrategyFilter } from "@/lib/strategy-filter";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  const { selected, toggle, setAll } = useStrategyFilter();
  const allSelected = selected.length === ALL_STRATEGY_KEYS.length;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/welcome" className="flex items-center">
            <img src="/omnispace-logo.png" alt="Deal Negotiator — Omnispace Estates" className="h-9 w-auto" />
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/welcome" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <Home className="h-4 w-4" /> Welcome
            </Link>
            <Link to="/properties" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <ListChecks className="h-4 w-4" /> Properties
            </Link>
            <AddPropertyDialog
              trigger={
                <Button variant="ghost" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-normal text-foreground hover:bg-muted">
                  <PlusCircle className="h-4 w-4" /> Add property
                </Button>
              }
            />
            <Link to="/searches" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <Bell className="h-4 w-4" /> Reminders
            </Link>
            <Link to="/persona" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
              <Sliders className="h-4 w-4" /> Investment
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-normal text-foreground hover:bg-muted">
                  <Filter className="h-4 w-4" /> Strategy lens{!allSelected && ` (${selected.length})`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Show recommendations for</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_STRATEGY_KEYS.map((key) => (
                  <DropdownMenuCheckboxItem key={key} checked={selected.includes(key)} onCheckedChange={() => toggle(key)} onSelect={(e) => e.preventDefault()}>
                    {STRATEGY_LABELS[key]}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={allSelected} onCheckedChange={() => setAll(allSelected ? [] : ALL_STRATEGY_KEYS)} onSelect={(e) => e.preventDefault()}>
                  All strategies
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
