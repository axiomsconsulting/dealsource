import { Link } from "@tanstack/react-router";
import { Sliders, Filter, Home, ListChecks, Menu, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useColorMode } from "@/components/ThemeProvider";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/profile.functions";
import type { ReactNode } from "react";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

const navLinkClass =
  "flex items-center gap-2 rounded-full px-4 py-2 text-sm text-background/80 hover:bg-background/10 hover:text-background";
const navLinkActiveProps = {
  className: "bg-background text-foreground hover:bg-background hover:text-foreground",
};

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { mode, toggle: toggleColorMode } = useColorMode();
  const { selected, toggle, setAll } = useStrategyFilter();
  const allSelected = selected.length === ALL_STRATEGY_KEYS.length;

  const getMyProfileFn = useServerFn(getMyProfile);
  const { data: myProfile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getMyProfileFn(),
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = myProfile?.role === "admin" || myProfile?.role === "super_admin";
  const initials = (myProfile?.display_name || myProfile?.email || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 bg-background/80 px-3 pt-[calc(env(safe-area-inset-top)+1rem)] backdrop-blur sm:px-6">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <Link to="/welcome" className="flex items-center">
            <img
              src="/omnispace-logo.png"
              alt="Deal Negotiator — Omnispace Estates"
              className="h-8 w-auto"
            />
          </Link>

          <div className="flex items-center gap-2">
            {/* Primary nav — desktop/tablet only */}
            <nav className="hidden items-center gap-1 rounded-full bg-foreground px-1.5 py-1.5 text-background shadow-sm md:flex">
              <Link to="/welcome" className={navLinkClass} activeProps={navLinkActiveProps}>
                <Home className="h-4 w-4" /> Home
              </Link>
              <Link to="/properties" className={navLinkClass} activeProps={navLinkActiveProps}>
                <ListChecks className="h-4 w-4" /> Pipeline
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={`${navLinkClass} font-normal`}>
                    <Filter className="h-4 w-4" /> Strategy{!allSelected && ` (${selected.length})`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Show recommendations for</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_STRATEGY_KEYS.map((key) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={selected.includes(key)}
                      onCheckedChange={() => toggle(key)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {STRATEGY_LABELS[key]}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={allSelected}
                    onCheckedChange={() => setAll(allSelected ? [] : ALL_STRATEGY_KEYS)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    All strategies
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Link to="/persona" className={navLinkClass} activeProps={navLinkActiveProps}>
                <Sliders className="h-4 w-4" /> Investor
              </Link>
            </nav>

            {/* Admin — its own pill, desktop/tablet only */}
            {isAdmin && (
              <nav className="hidden items-center gap-1 rounded-full bg-foreground px-1.5 py-1.5 text-background shadow-sm md:flex">
                <Link
                  to="/admin/feedback"
                  className={navLinkClass}
                  activeProps={navLinkActiveProps}
                >
                  <ShieldCheck className="h-4 w-4" /> Admin
                </Link>
              </nav>
            )}

            {/* Hamburger menu — mobile only, holds the lower-priority items above */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px]">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="mt-4 flex flex-col gap-1">
                  <Link
                    to="/welcome"
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted"
                    activeProps={{ className: "bg-muted text-primary" }}
                  >
                    <Home className="h-4 w-4" /> Home
                  </Link>
                  <Link
                    to="/properties"
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted"
                    activeProps={{ className: "bg-muted text-primary" }}
                  >
                    <ListChecks className="h-4 w-4" /> Pipeline
                  </Link>
                  <Link
                    to="/persona"
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted"
                    activeProps={{ className: "bg-muted text-primary" }}
                  >
                    <Sliders className="h-4 w-4" /> Investor
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin/feedback"
                      className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted"
                      activeProps={{ className: "bg-muted text-primary" }}
                    >
                      <ShieldCheck className="h-4 w-4" /> Admin
                    </Link>
                  )}
                  <div className="mt-2 border-t pt-2">
                    <p className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Filter className="h-3.5 w-3.5" /> Strategy
                    </p>
                    {ALL_STRATEGY_KEYS.map((key) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={selected.includes(key)}
                          onCheckedChange={() => toggle(key)}
                        />
                        {STRATEGY_LABELS[key]}
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => setAll(allSelected ? [] : ALL_STRATEGY_KEYS)}
                      />
                      All strategies
                    </label>
                  </div>
                  <Link
                    to="/profile"
                    className="mt-2 flex items-center gap-2 rounded-md border-t px-3 py-2.5 pt-4 text-sm hover:bg-muted"
                    activeProps={{ className: "bg-muted text-primary" }}
                  >
                    <UserRound className="h-4 w-4" /> Profile
                  </Link>
                  <button
                    onClick={toggleColorMode}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {mode === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                </div>
              </SheetContent>
            </Sheet>

            <Button
              variant="ghost"
              size="icon"
              className="hidden rounded-full sm:flex"
              aria-label="Toggle dark mode"
              onClick={toggleColorMode}
            >
              {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Link
              to="/profile"
              aria-label="Profile"
              className="flex items-center rounded-full border bg-card p-1 shadow-sm"
              activeProps={{ className: "ring-2 ring-primary/60" }}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={myProfile?.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="bg-muted text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </header>
      <main className="container mx-auto flex-1 px-3 py-5 sm:px-6">
        {title && <h1 className="mb-6 text-2xl font-bold tracking-tight">{title}</h1>}
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
