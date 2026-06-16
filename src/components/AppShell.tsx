import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Info, Sliders, Filter, Home, ListChecks, Menu, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useColorMode } from "@/components/ThemeProvider";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/profile.functions";
import { getReturnSession, switchBack } from "@/lib/impersonation";
import { CampaignNotifications } from "@/components/CampaignNotifications";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
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
  const router = useRouter();
  const { mode, toggle: toggleColorMode } = useColorMode();
  const { selected, toggle, setAll } = useStrategyFilter();
  const allSelected = selected.length === ALL_STRATEGY_KEYS.length;
  const [returnSession] = useState(() => getReturnSession());

  // Fade floating controls to near-transparent while the page is being scrolled
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onScroll = () => {
      setScrolling(true);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => setScrolling(false), 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  const handleSwitchBack = async () => {
    await switchBack();
    router.navigate({ to: "/admin/users" });
  };

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

  // Shared sheet drawer content — used in both desktop header and mobile overlay
  const sheetNav = (
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
      <Link
        to="/about"
        className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted"
        activeProps={{ className: "bg-muted text-primary" }}
      >
        <Info className="h-4 w-4" /> About
      </Link>
      <button
        onClick={toggleColorMode}
        className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted"
      >
        {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {mode === "dark" ? "Light mode" : "Dark mode"}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Impersonation banner — inline (scrolls with page on mobile, visible on all sizes) */}
      {returnSession && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-3 py-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] text-xs font-medium text-amber-950 sm:px-6">
          <span>Viewing as {myProfile?.email ?? "another user"} — Super Admin mode</span>
          <div className="flex items-center gap-2">
            <Link to="/admin/users" className="underline">Switch user</Link>
            <button onClick={handleSwitchBack} className="rounded bg-amber-950/10 px-2 py-0.5 underline-offset-2 hover:underline">
              Switch back
            </button>
          </div>
        </div>
      )}

      {/* ── Desktop sticky header (hidden on mobile < 640 px) ─────────────── */}
      <header className={cn(
        "hidden sm:sticky sm:top-0 sm:z-30 sm:block bg-background/80 px-3 backdrop-blur sm:px-6",
        returnSession ? "pt-1" : "sm:pt-[max(1rem,env(safe-area-inset-top))]",
      )}>
        <div className="container mx-auto flex items-center justify-between gap-3">
          <Link to="/welcome" className="flex items-center">
            <img
              src="/omnispace-logo.png"
              alt="Deal Negotiator — Omnispace Estates"
              className="h-10 w-auto"
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

            {/* Admin pill — desktop/tablet only */}
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

            {/* Hamburger — sm screens (640–767 px) only */}
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
                <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
                {sheetNav}
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

      {/* ── Mobile floating overlay (hidden on sm+) ────────────────────────
          Three-section row: back · logo (centre) · profile + burger.
          Fades to near-invisible while the page is being scrolled. */}
      <div
        className={cn(
          "fixed left-0 right-0 top-0 z-40 flex items-center gap-2 px-3 pb-2 sm:hidden",
          "pt-[max(0.75rem,env(safe-area-inset-top))]",
          "transition-opacity duration-500",
          scrolling ? "opacity-[0.12]" : "opacity-100",
        )}
      >
        {/* Left — back button */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background"
          onClick={() => window.history.back()}
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        {/* Centre — logo */}
        <div className="flex flex-1 justify-center">
          <Link to="/welcome">
            <img
              src="/omnispace-logo.png"
              alt="Deal Negotiator — Omnispace Estates"
              className="h-8 w-auto"
            />
          </Link>
        </div>

        {/* Right — profile avatar + burger menu */}
        <div className="flex shrink-0 items-center gap-2">
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

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
              {sheetNav}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <main
        className={cn(
          "container mx-auto flex-1 px-3 pb-5 sm:px-6 sm:pt-5",
          "pt-[max(3.75rem,calc(env(safe-area-inset-top)+3rem))] sm:pt-5",
        )}
      >
        {title && <h1 className="mb-6 text-2xl font-bold tracking-tight">{title}</h1>}
        {children}
      </main>

      <AppFooter />
      <CampaignNotifications />
    </div>
  );
}
