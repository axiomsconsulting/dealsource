import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Default (0) makes every remount of a query — e.g. navigating from a property to its
        // viewing sub-route and back — refetch and show a loading state even though the data
        // hasn't changed. A short stale window lets cached data render instantly on revisit.
        staleTime: 30 * 1000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
