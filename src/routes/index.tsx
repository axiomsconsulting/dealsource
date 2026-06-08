import { createFileRoute, Link } from "@tanstack/react-router";
import { TrendingUp, ScrollText, Sliders } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deal Negotiator — UK Property Investment Analyser" },
      { name: "description", content: "Ingest properties from Property Filter, run BTL / BRRR / SA / HMO / Flip analysis, generate negotiation playbooks and investor deal sheets." },
      { property: "og:title", content: "Deal Negotiator" },
      { property: "og:description", content: "BTL / BRRR / SA / HMO / Flip analysis with negotiation playbook." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <img src="/omnispace-logo.png" alt="Deal Negotiator — Omnispace Estates" className="h-9 w-auto" />
          <Link to="/auth" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Sign in
          </Link>
        </div>
      </header>
      <section className="container mx-auto flex-1 px-6 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight">
          Stop paying asking price. <span className="text-primary">Negotiate deals like a pro.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Ingest Property Filter CSVs and JSON, analyse against BTL / BRRR / SA / HMO / Flip / Title Split,
          generate a justified offer with negotiation points, and produce a redactable deal sheet — all in one place.
        </p>
        <Link to="/auth" className="mt-8 inline-block rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90">
          Get started
        </Link>
        <div className="mt-20 grid gap-6 md:grid-cols-3 text-left">
          {[
            { icon: TrendingUp, t: "6 strategies", d: "BTL, BRRR, SA, HMO, Flip, Title Split scored side-by-side per property." },
            { icon: ScrollText, t: "Negotiation playbook", d: "Auto-generated points with justified £ impact you can take to the agent." },
            { icon: Sliders, t: "Live sliders", d: "Tune offer, refurb, rent, rate, LTV, ARV — every metric updates in real time." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-lg border bg-card p-6">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>
      <AppFooter />
    </div>
  );
}
