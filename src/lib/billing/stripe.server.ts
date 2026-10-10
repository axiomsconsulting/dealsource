import Stripe from "stripe";
import type { PaidPlan } from "./plans";

let _s: Stripe | undefined;
export function stripe(): Stripe {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY missing");
  return (_s ??= new Stripe(k, { httpClient: Stripe.createFetchHttpClient() }));
}

const cache = new Map<string, { id: string; at: number }>();
export async function priceIdFor(lookupKey: string): Promise<string> {
  const hit = cache.get(lookupKey);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.id;
  const r = await stripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (!r.data[0]) throw new Error(`Stripe price ${lookupKey} not found`);
  cache.set(lookupKey, { id: r.data[0].id, at: Date.now() });
  return r.data[0].id;
}

export function planFromPrice(p: Stripe.Price): { plan: PaidPlan; interval: "month" | "year" } | null {
  const m = /^dn_(starter|investor|pro)_(month|year)$/.exec(p.lookup_key ?? "");
  if (!m) return null;
  return { plan: m[1] as PaidPlan, interval: m[2] as "month" | "year" };
}

export function appUrl(): string {
  return (process.env.APP_URL || "https://dealsource.lovable.app").replace(/\/$/, "");
}
