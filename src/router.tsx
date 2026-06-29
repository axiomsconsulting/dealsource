import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { maybeInstallImpersonationStorage } from "@/lib/impersonation-storage";

// Must run before the Supabase singleton is first used (client-side only).
maybeInstallImpersonationStorage();

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Prevents unnecessary refetches when navigating back to a page within this window.
        staleTime: 30 * 1000,
        // Keep unused cache for 10 minutes so navigating back is instant.
        gcTime: 10 * 60 * 1000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading routes (and their loaders) when a link is hovered/focused,
    // not just after the click — this hides almost all navigation latency.
    defaultPreload: "intent",
    defaultPreloadDelay: 100,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
