import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const sig = request.headers.get("stripe-signature");
        if (!secret || !sig) return new Response("Missing signature", { status: 400 });
        const { stripe, planFromPrice } = await import("@/lib/billing/stripe.server");
        const { TOPUP_CREDITS } = await import("@/lib/billing/plans");
        const body = await request.text();
        let event: any;
        try {
          event = await stripe().webhooks.constructEventAsync(body, sig, secret);
        } catch (e) {
          console.error("stripe webhook signature failed", e);
          return new Response("Bad signature", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: dupErr } = await supabaseAdmin.from("stripe_events").insert({ id: event.id, type: event.type });
        if (dupErr) return new Response("ok (duplicate)", { status: 200 });

        const ts = (n?: number | null) => (n ? new Date(n * 1000).toISOString() : null);

        async function userFor(customerId: string, metaUid?: string) {
          if (metaUid) return metaUid;
          const { data } = await supabaseAdmin.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
          return data?.user_id as string | undefined;
        }

        async function syncSub(sub: any) {
          const uid = await userFor(sub.customer, sub.metadata?.user_id);
          if (!uid) return;
          const item = sub.items?.data?.[0];
          const pi = item?.price ? planFromPrice(item.price) : null;
          const deleted = sub.status === "canceled";
          await supabaseAdmin.from("subscriptions").upsert(
            {
              user_id: uid,
              stripe_customer_id: sub.customer,
              stripe_subscription_id: sub.id,
              plan: deleted ? "none" : pi?.plan ?? "none",
              billing_interval: pi?.interval ?? null,
              status: sub.status,
              trial_ends_at: ts(sub.trial_end),
              current_period_start: ts(item?.current_period_start ?? sub.current_period_start),
              current_period_end: ts(item?.current_period_end ?? sub.current_period_end),
              cancel_at_period_end: !!sub.cancel_at_period_end,
              source: "stripe",
            },
            { onConflict: "user_id" },
          );
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const s = event.data.object;
              const uid = s.metadata?.user_id ?? s.client_reference_id;
              if (s.metadata?.kind === "topup" && uid && s.payment_status === "paid") {
                const { data } = await supabaseAdmin.from("subscriptions").select("topup_credits").eq("user_id", uid).maybeSingle();
                await supabaseAdmin.from("subscriptions").upsert(
                  { user_id: uid, stripe_customer_id: s.customer, topup_credits: (data?.topup_credits ?? 0) + TOPUP_CREDITS },
                  { onConflict: "user_id" },
                );
              } else if (s.subscription) {
                await syncSub(await stripe().subscriptions.retrieve(s.subscription));
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
            case "customer.subscription.trial_will_end":
              await syncSub(event.data.object);
              break;
            case "invoice.paid": {
              const subId = event.data.object.subscription ?? event.data.object.parent?.subscription_details?.subscription;
              if (subId) await syncSub(await stripe().subscriptions.retrieve(subId));
              break;
            }
            case "invoice.payment_failed": {
              const uid = await userFor(event.data.object.customer);
              if (uid) await supabaseAdmin.from("subscriptions").update({ status: "past_due" }).eq("user_id", uid);
              break;
            }
          }
        } catch (e) {
          console.error("stripe webhook handler error", event.type, e);
          await supabaseAdmin.from("stripe_events").delete().eq("id", event.id);
          return new Response("Handler error", { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
