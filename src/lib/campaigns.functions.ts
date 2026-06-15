import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHANNELS = ["toast", "email", "login_modal"] as const;

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async () => {
    const { data: campaigns, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: recipients } = await supabaseAdmin
      .from("campaign_recipients")
      .select("campaign_id, dismissed_at");
    const counts = new Map<string, { total: number; dismissed: number }>();
    for (const r of recipients ?? []) {
      const c = counts.get(r.campaign_id) ?? { total: 0, dismissed: 0 };
      c.total++;
      if (r.dismissed_at) c.dismissed++;
      counts.set(r.campaign_id, c);
    }

    return (campaigns ?? []).map((c) => ({
      ...c,
      recipient_count: counts.get(c.id)?.total ?? 0,
      dismissed_count: counts.get(c.id)?.dismissed ?? 0,
    }));
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(2000),
      audienceType: z.enum(["all", "inactive", "specific"]),
      inactiveHours: z.number().int().min(1).max(24 * 365).optional(),
      userIds: z.array(z.string().uuid()).optional(),
      channels: z.array(z.enum(CHANNELS)).min(1),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("campaigns").insert({
      title: data.title,
      body: data.body,
      audience_type: data.audienceType,
      inactive_hours: data.inactiveHours ?? null,
      user_ids: data.userIds ?? null,
      channels: data.channels,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function personalise(template: string, vars: { name: string; properties: number }) {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, vars.name)
    .replace(/\{\{\s*properties\s*\}\}/gi, String(vars.properties));
}

export const sendCampaign = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    if (campaignError || !campaign) throw new Error("Campaign not found");
    if (campaign.status === "sent") throw new Error("Campaign already sent");

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name");
    if (profilesError) throw new Error(profilesError.message);

    let recipients = profiles ?? [];
    if (campaign.audience_type === "specific") {
      const ids = new Set(campaign.user_ids ?? []);
      recipients = recipients.filter((p) => ids.has(p.id));
    } else if (campaign.audience_type === "inactive") {
      const hours = campaign.inactive_hours ?? 72;
      const cutoff = Date.now() - hours * 60 * 60 * 1000;
      const { data: logins } = await supabaseAdmin
        .from("login_events")
        .select("user_id, created_at")
        .order("created_at", { ascending: false });
      const lastLogin = new Map<string, number>();
      for (const l of logins ?? []) {
        if (!lastLogin.has(l.user_id)) lastLogin.set(l.user_id, new Date(l.created_at).getTime());
      }
      recipients = recipients.filter((p) => {
        const last = lastLogin.get(p.id);
        return last === undefined || last < cutoff;
      });
    }

    if (!recipients.length) {
      await supabaseAdmin.from("campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", data.id);
      return { ok: true, sent: 0 };
    }

    const { data: properties } = await supabaseAdmin.from("properties").select("user_id");
    const propertyCounts = new Map<string, number>();
    for (const p of properties ?? []) {
      propertyCounts.set(p.user_id, (propertyCounts.get(p.user_id) ?? 0) + 1);
    }

    const channels = campaign.channels as string[];
    const wantsEmail = channels.includes("email");
    const inAppChannels = channels.filter((c) => c !== "email");

    let resend: any = null;
    let fromEmail = "alerts@dealsourcer.app";
    if (wantsEmail) {
      const { Resend } = await import("resend");
      const resendKey = process.env.RESEND_API_KEY;
      fromEmail = process.env.ALERT_FROM_EMAIL ?? fromEmail;
      if (resendKey) resend = new Resend(resendKey);
    }

    let sent = 0;
    for (const p of recipients) {
      const vars = { name: p.display_name || "there", properties: propertyCounts.get(p.id) ?? 0 };
      const personalisedBody = personalise(campaign.body, vars);
      const channelsSent: string[] = [...inAppChannels];

      if (wantsEmail && resend && p.email) {
        try {
          await resend.emails.send({
            from: fromEmail,
            to: p.email,
            subject: campaign.title,
            html: `<p>${personalisedBody.replace(/\n/g, "<br/>")}</p>`,
          });
          channelsSent.push("email");
        } catch (e) {
          console.error("campaign email send", e);
        }
      }

      const { error: recipientError } = await supabaseAdmin
        .from("campaign_recipients")
        .upsert(
          { campaign_id: data.id, user_id: p.id, channels_sent: channelsSent },
          { onConflict: "campaign_id,user_id" },
        );
      if (!recipientError) sent++;
    }

    await supabaseAdmin.from("campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true, sent };
  });

export const getMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("display_name")
      .eq("id", context.userId)
      .single();
    const { count: propertiesCount } = await context.supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);

    const { data: recipients, error } = await context.supabase
      .from("campaign_recipients")
      .select("id, campaign_id, channels_sent, dismissed_at, campaigns(id, title, body)")
      .eq("user_id", context.userId)
      .is("dismissed_at", null);
    if (error) throw new Error(error.message);

    const vars = { name: profile?.display_name || "there", properties: propertiesCount ?? 0 };

    return (recipients ?? [])
      .filter((r: any) => r.campaigns)
      .map((r: any) => ({
        recipientId: r.id,
        campaignId: r.campaign_id,
        title: r.campaigns.title as string,
        body: personalise(r.campaigns.body as string, vars),
        channels: r.channels_sent as string[],
      }));
  });

export const dismissNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaign_recipients")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("campaign_id", data.campaignId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
