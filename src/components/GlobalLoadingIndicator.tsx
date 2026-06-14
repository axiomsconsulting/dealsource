import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

// Shows an iOS-style spinner whenever the app is busy (route transition, query
// fetch, or mutation) — but only after a short delay, so quick loads don't flash it.
export function GlobalLoadingIndicator() {
  const routerLoading = useRouterState({ select: (s) => s.status === "pending" });
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const busy = routerLoading || isFetching > 0 || isMutating > 0;

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, [busy]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-foreground/90 px-8 py-7 text-background shadow-2xl">
        <Loader2 className="h-10 w-10 animate-spin" />
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </div>
  );
}
