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
      className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-foreground/80 text-background shadow-lg backdrop-blur"
    >
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
