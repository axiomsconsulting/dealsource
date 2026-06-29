import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPeerSharePreview, claimPeerShare } from "@/lib/share.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Home, ArrowRight, Users } from "lucide-react";
import { fmtGBP } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/share/$token")({
  head: () => ({ meta: [{ title: "Shared property — Deal Negotiator" }] }),
  component: SharePage,
});

function SharePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const preview = useServerFn(getPeerSharePreview);
  const claim = useServerFn(claimPeerShare);

  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const previewQ = useQuery({
    queryKey: ["peer-share-preview", token],
    queryFn: () => preview({ data: { token } }),
  });

  const claimMut = useMutation({
    mutationFn: () => claim({ data: { token } }),
    onSuccess: (r: any) => {
      if (r.duplicate) toast.info("Already in your library — opening it now.");
      else if (r.alreadyYours) toast.info("This is your property.");
      else toast.success("Added to your deal library");
      navigate({ to: "/properties/$id", params: { id: r.propertyId } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Auto-claim if returning from sign-in
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authed && sessionStorage.getItem("pending-claim") === token) {
      sessionStorage.removeItem("pending-claim");
      claimMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, token]);

  if (previewQ.isLoading || authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const data = previewQ.data;
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-bold">Share link unavailable</h1>
          <p className="mt-2 text-muted-foreground">This link may have expired or been revoked.</p>
        </div>
      </div>
    );
  }
  const p = data.property;
  const hero = (p.image_urls ?? [])[0];

  const goAuth = (mode: "signin" | "signup") => {
    if (typeof window !== "undefined") sessionStorage.setItem("pending-claim", token);
    navigate({
      to: "/auth",
      search: { redirect: `/share/${token}`, mode } as any,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 md:px-6">
          <img src="/omnispace-logo.png" alt="Deal Negotiator" className="h-8 w-auto" />
          <Badge variant="outline">
            <Users className="mr-1.5 h-3 w-3" /> Shared property
          </Badge>
        </div>
      </header>
      <main className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
        <p className="mb-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{data.ownerName}</span> shared a property
          with you.
        </p>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {hero ? (
            <img src={hero} alt="" className="h-64 w-full object-cover" />
          ) : (
            <div className="flex h-48 items-center justify-center bg-muted text-muted-foreground">
              <Home className="h-10 w-10" />
            </div>
          )}
          <div className="space-y-3 p-5">
            <h1 className="text-xl font-bold">{p.address ?? "Address hidden by sharer"}</h1>
            <div className="flex flex-wrap gap-1.5">
              {p.beds != null && <Badge variant="outline">{p.beds} bed</Badge>}
              {p.baths != null && <Badge variant="outline">{p.baths} bath</Badge>}
              {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
              {p.epc_rate && <Badge variant="outline">EPC {p.epc_rate}</Badge>}
              {p.tenure && <Badge variant="outline">{p.tenure}</Badge>}
              {p.area_sqm && <Badge variant="outline">{Math.round(p.area_sqm)} m²</Badge>}
              {p.article4_status === "inside" && (
                <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900">
                  Article 4
                </Badge>
              )}
            </div>
            {p.asking_price_gbp && (
              <p className="text-2xl font-bold">
                {p.price_qualifier ? `${p.price_qualifier} ` : "Asking "}
                {fmtGBP(p.asking_price_gbp)}
              </p>
            )}
            {p.source_link && (
              <a
                href={p.source_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View original listing <ArrowRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-3 rounded-xl border bg-muted/30 p-5">
          {authed ? (
            <>
              <p className="text-sm font-medium">Add this property to your deal library?</p>
              <p className="text-xs text-muted-foreground">
                A copy lands in your account so you can run your own analysis and negotiations.
              </p>
              <Button
                onClick={() => claimMut.mutate()}
                disabled={claimMut.isPending}
                className="w-full sm:w-auto"
              >
                {claimMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add to my deals
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Want to add this to your own deal library?</p>
              <p className="text-xs text-muted-foreground">
                Sign in or create a free account — we'll add it immediately.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => goAuth("signin")}>Sign in & add</Button>
                <Button variant="outline" onClick={() => goAuth("signup")}>
                  Create account & add
                </Button>
              </div>
            </>
          )}
          <Link to="/" className="block text-xs text-muted-foreground hover:underline">
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}