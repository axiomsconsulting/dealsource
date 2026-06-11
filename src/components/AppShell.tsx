import { Link, useRouter } from "@tanstack/react-router";
import { PlusCircle, ListChecks, LogOut, Sliders, Bell, Home, Filter, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";
import { AppFooter } from "@/components/AppFooter";
import { AddPropertyDialog } from "@/components/AddPropertyDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ALL_STRATEGY_KEYS, STRATEGY_LABELS, useStrategyFilter } from "@/lib/strategy-filter";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const router = useRouter();
  const { selected, toggle, setAll } = useStrategyFilter();
  const allSelected = selected.length === ALL_STRATEGY_KEYS.length;

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between px-3 py-4 sm:px-6">
          <Link to="/welcome" className="flex items-center">
            <img src="/omnispace-logo.png" alt="Deal Negotiator — Omnispace Estates" className="h-9 w-auto" />
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/properties" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted sm:px-3" activeProps={{ className: "bg-muted text-primary" }}>
              <ListChecks className="h-4 w-4" /> <span className="hidden sm:inline">Properties</span>
            </Link>
            <AddPropertyDialog
              trigger={
                <Button variant="ghost" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-normal text-foreground hover:bg-muted sm:px-3">
                  <PlusCircle className="h-4 w-4" /> <span className="hidden sm:inline">Add property</span>
                </Button>
              }
            />

            {/* Full nav — desktop/tablet only */}
            <div className="hidden items-center gap-1 md:flex">
              <Link to="/welcome" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
                <Home className="h-4 w-4" /> Welcome
              </Link>
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
              <button onClick={signOut} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>

            {/* Hamburger menu — mobile only, holds the lower-priority items above */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px]">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="mt-4 flex flex-col gap-1">
                  <Link to="/welcome" className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
                    <Home className="h-4 w-4" /> Welcome
                  </Link>
                  <Link to="/searches" className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
                    <Bell className="h-4 w-4" /> Reminders
                  </Link>
                  <Link to="/persona" className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted" activeProps={{ className: "bg-muted text-primary" }}>
                    <Sliders className="h-4 w-4" /> Investment
                  </Link>
                  <div className="mt-2 border-t pt-2">
                    <p className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Filter className="h-3.5 w-3.5" /> Strategy lens
                    </p>
                    {ALL_STRATEGY_KEYS.map((key) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
                        <Checkbox checked={selected.includes(key)} onCheckedChange={() => toggle(key)} />
                        {STRATEGY_LABELS[key]}
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
                      <Checkbox checked={allSelected} onCheckedChange={() => setAll(allSelected ? [] : ALL_STRATEGY_KEYS)} />
                      All strategies
                    </label>
                  </div>
                  <button onClick={signOut} className="mt-2 flex items-center gap-2 rounded-md border-t px-3 py-2.5 pt-4 text-left text-sm text-muted-foreground hover:bg-muted">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </nav>
        </div>
      </header>
      <main className="container mx-auto flex-1 px-3 py-8 sm:px-6">
        {title && <h1 className="mb-6 text-2xl font-bold tracking-tight">{title}</h1>}
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
