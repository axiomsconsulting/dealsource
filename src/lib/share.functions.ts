import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeRiskFlags } from "./analysis/risk";
import { lookupArticle4WithClient } from "./analysis/article4";
import { estimateRefurb } from "./analysis/refurb";

const ShareDefaultsSchema = z.object({
  redact: z.boolean(),
  hide_address: z.boolean(),
  hide_photos: z.boolean(),
  include_refurb_breakdown: z.boolean(),
  include_risk_flags: z.boolean(),
});
export type ShareDefaults = z.infer<typeof ShareDefaultsSchema>;

export const DEFAULT_SHARE_DEFAULTS: ShareDefaults = {
  redact: true,
  hide_address: false,
  hide_photos: false,
  include_refurb_breakdown: true,
  include_risk_flags: true,
};

export const getMyShareDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("share_defaults")
      .eq("id", context.userId)
      .maybeSingle();
    return { ...DEFAULT_SHARE_DEFAULTS, ...((data as any)?.share_defaults ?? {}) } as ShareDefaults;
  });

export const updateMyShareDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ShareDefaultsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ share_defaults: data as any })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return data;
  });

/** Create (or reuse) a peer-share link for a property the caller owns. */
export const createPeerShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prop, error: pe } = await context.supabase
      .from("properties")
      .select("id, user_id")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (pe || !prop) throw new Error("Property not found");
    if (prop.user_id !== context.userId) throw new Error("Not your property");
    const { data: existing } = await context.supabase
      .from("peer_shares")
      .select("token, is_active")
      .eq("property_id", data.propertyId)
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (existing) {
      if (!existing.is_active) {
        await context.supabase
          .from("peer_shares")
          .update({ is_active: true })
          .eq("property_id", data.propertyId)
          .eq("owner_user_id", context.userId);
      }
      return { token: existing.token as string };
    }
    const { data: row, error } = await context.supabase
      .from("peer_shares")
      .insert({ owner_user_id: context.userId, property_id: data.propertyId })
      .select("token")
      .single();
    if (error) throw new Error(error.message);
    return { token: row.token as string };
  });

/** Public preview of a peer-shared property — used on /share/:token before claim. */
export const getPeerSharePreview = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share } = await supabaseAdmin
      .from("peer_shares")
      .select("property_id, owner_user_id, is_active")
      .eq("token", data.token)
      .maybeSingle();
    if (!share || !share.is_active) return null;
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select(
        "id, address, postcode, city, beds, baths, property_type, epc_rate, tenure, area_sqm, asking_price_gbp, price_qualifier, source_link, image_urls, article4_status",
      )
      .eq("id", share.property_id)
      .maybeSingle();
    if (!prop) return null;
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("display_name, share_defaults")
      .eq("id", share.owner_user_id)
      .maybeSingle();
    const defaults = { ...DEFAULT_SHARE_DEFAULTS, ...((owner as any)?.share_defaults ?? {}) };
    return {
      property: {
        ...prop,
        address: defaults.hide_address ? null : prop.address,
        image_urls: defaults.hide_photos ? [] : (prop.image_urls ?? []),
      },
      ownerName: (owner as any)?.display_name ?? "A Deal Negotiator user",
    };
  });

/** Sign-in required. Copies the shared property into the caller's library. */
export const claimPeerShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share } = await supabaseAdmin
      .from("peer_shares")
      .select("property_id, owner_user_id, is_active")
      .eq("token", data.token)
      .maybeSingle();
    if (!share || !share.is_active) throw new Error("Share link is invalid or revoked");
    if (share.owner_user_id === context.userId) {
      return { propertyId: share.property_id, alreadyYours: true };
    }
    const { data: source } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("id", share.property_id)
      .maybeSingle();
    if (!source) throw new Error("Shared property no longer available");

    // De-dupe by source_link for the same user
    if (source.source_link) {
      const { data: dupe } = await context.supabase
        .from("properties")
        .select("id")
        .eq("user_id", context.userId)
        .eq("source_link", source.source_link)
        .maybeSingle();
      if (dupe) return { propertyId: dupe.id as string, duplicate: true };
    }

    const propInput: any = {
      address: source.address,
      postcode: source.postcode,
      city: source.city,
      beds: source.beds,
      baths: source.baths,
      property_type: source.property_type,
      epc_rate: source.epc_rate,
      tenure: source.tenure,
      area_sqm: source.area_sqm,
      asking_price_gbp: source.asking_price_gbp,
      price_qualifier: source.price_qualifier,
      agent_name: source.agent_name,
      source: "shared",
      source_link: source.source_link,
      image_urls: source.image_urls ?? [],
      pf_json: source.pf_json ?? null,
      lease_years_remaining: source.lease_years_remaining,
    };
    const risks = computeRiskFlags(propInput);
    const a4 = await lookupArticle4WithClient(context.supabase, propInput.postcode ?? null);
    const refurb = estimateRefurb(propInput, "medium");
    const { data: inserted, error } = await context.supabase
      .from("properties")
      .insert({
        ...propInput,
        user_id: context.userId,
        risk_flags: { flags: risks, computed_at: new Date().toISOString(), shared_from: share.owner_user_id } as any,
        article4_status: a4.status,
        article4_source: a4.status !== "unknown" ? "cache" : null,
        refurb_estimate: refurb as any,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { propertyId: inserted.id as string };
  });