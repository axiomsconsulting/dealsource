import { createFileRoute } from "@tanstack/react-router";
import { analyseProperty } from "@/lib/analysis/engine";

export const Route = createFileRoute("/api/public/run-search-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // simple apikey gate — Supabase anon key, also bypasses other auth
        const provided = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || provided !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { Resend } = await import("resend");
        const resendKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.ALERT_FROM_EMAIL ?? "alerts@dealsourcer.app";
        const resend = resendKey ? new Resend(resendKey) : null;

        const { data: searches } = await supabaseAdmin
          .from("saved_searches").select("*").eq("is_active", true).neq("frequency", "off");
        let totalMatches = 0, totalEmails = 0;

        for (const s of searches ?? []) {
          const { data: persona } = await supabaseAdmin
            .from("personas").select("*").eq("id", s.persona_id ?? "").maybeSingle();
          const effPersona = persona ?? (await supabaseAdmin
            .from("personas").select("*").eq("user_id", s.user_id).eq("is_default", true).maybeSingle()).data;
          if (!effPersona) continue;

          let q = supabaseAdmin.from("properties").select("*").eq("user_id", s.user_id);
          if (s.postcode_prefix) q = q.ilike("postcode", `${s.postcode_prefix}%`);
          if (s.city) q = q.ilike("city", `%${s.city}%`);
          if (s.min_beds != null) q = q.gte("beds", s.min_beds);
          if (s.max_beds != null) q = q.lte("beds", s.max_beds);
          if (s.min_price != null) q = q.gte("asking_price_gbp", s.min_price);
          if (s.max_price != null) q = q.lte("asking_price_gbp", s.max_price);
          const { data: props } = await q.limit(500);

          const { data: seen } = await supabaseAdmin
            .from("search_matches").select("property_id").eq("saved_search_id", s.id);
          const seenSet = new Set((seen ?? []).map((r) => r.property_id));

          const newMatches: { id: string; address: string; score: number }[] = [];
          for (const p of props ?? []) {
            if (seenSet.has(p.id)) continue;
            const result = analyseProperty(p as any, effPersona as any, {});
            if (result.overallScore >= (s.min_deal_score ?? 60)) {
              await supabaseAdmin.from("search_matches").insert({
                user_id: s.user_id, saved_search_id: s.id, property_id: p.id,
                deal_score: result.overallScore, notified_at: new Date().toISOString(),
              });
              newMatches.push({ id: p.id, address: p.address, score: result.overallScore });
              totalMatches++;
            }
          }

          if (newMatches.length && resend && s.notify_email) {
            const html = `<h2>${newMatches.length} new deal${newMatches.length > 1 ? "s" : ""} match "${s.name}"</h2>
              <ul>${newMatches.map((m) => `<li><strong>${m.score}/100</strong> — ${m.address}</li>`).join("")}</ul>
              <p>Open Deal Sourcer to view full analysis.</p>`;
            try {
              await resend.emails.send({
                from: fromEmail, to: s.notify_email,
                subject: `${newMatches.length} new deal match${newMatches.length > 1 ? "es" : ""}: ${s.name}`,
                html,
              });
              totalEmails++;
            } catch (e) { console.error("email send", e); }
          }
          await supabaseAdmin.from("saved_searches").update({ last_run_at: new Date().toISOString() }).eq("id", s.id);
        }

        return Response.json({ ok: true, totalMatches, totalEmails, processed: searches?.length ?? 0 });
      },
    },
  },
});