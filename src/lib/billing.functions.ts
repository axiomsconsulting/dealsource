import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getEntitlements } = await import("./billing/entitlements.server");
    return getEntitlements(context.supabase as any, context.userId);
  });

async function ensureCustomer(userId: string, email: string | undefined) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { stripe } = await import("./billing/stripe.server");
  const { data: sub } = await supabaseAdmin.from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (sub?.stripe_customer_id) return sub.stripe_customer_id;
  const c = await stripe().customers.create({ email, metadata: { user_id: userId } });
  await supabaseAdmin.from("subscriptions").upsert({ user_id: userId, stripe_customer_id: c.id }, { onConflict: "user_id" });
  return c.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ plan: z.enum(["starter", "investor", "pro"]), interval: z.enum(["month", "year"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { stripe, priceIdFor, appUrl } = await import("./billing/stripe.server");
    const { lookupKey } = await import("./billing/plans");
    const email = (context.claims as any)?.email as string | undefined;
    const customer = await ensureCustomer(context.userId, email);
    const price = await priceIdFor(lookupKey(data.plan, data.interval));
    const s = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: context.userId,
      metadata: { user_id: context.userId, kind: "subscription" },
      subscription_data: { metadata: { user_id: context.userId } },
      allow_promotion_codes: true,
      success_url: `${appUrl()}/profile?tab=billing&checkout=success`,
      cancel_url: `${appUrl()}/pricing?checkout=cancelled`,
    });
    return { url: s.url };
  });

export const createTopupCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { stripe, priceIdFor, appUrl } = await import("./billing/stripe.server");
    const { TOPUP_LOOKUP_KEY } = await import("./billing/plans");
    const email = (context.claims as any)?.email as string | undefined;
    const customer = await ensureCustomer(context.userId, email);
    const price = await priceIdFor(TOPUP_LOOKUP_KEY);
    const s = await stripe().checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: context.userId,
      metadata: { user_id: context.userId, kind: "topup" },
      success_url: `${appUrl()}/profile?tab=billing&topup=success`,
      cancel_url: `${appUrl()}/profile?tab=billing`,
    });
    return { url: s.url };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { stripe, appUrl } = await import("./billing/stripe.server");
    const email = (context.claims as any)?.email as string | undefined;
    const customer = await ensureCustomer(context.userId, email);
    const s = await stripe().billingPortal.sessions.create({ customer, return_url: `${appUrl()}/profile?tab=billing` });
    return { url: s.url };
  });
