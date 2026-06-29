import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { markImpersonationTab } from "@/lib/impersonation-storage";

export const Route = createFileRoute("/impersonate-as/$tokenHash")({
  ssr: false,
  head: () => ({ meta: [{ title: "Switching account…" }] }),
  component: ImpersonateAsPage,
});

function ImpersonateAsPage() {
  const { tokenHash } = Route.useParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Storage shim was installed at router bootstrap; ensure the per-tab flag
      // is set for any future reloads of this tab too.
      markImpersonationTab();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      // Hard reload into the impersonated session so every cached query, route
      // context and profile lookup re-runs with the new auth.uid().
      window.location.replace("/properties");
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenHash]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <p className="text-base font-medium">
          {error ? "Couldn't switch account" : "Switching to user view…"}
        </p>
        {error && (
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{error}</p>
        )}
      </div>
    </div>
  );
}
