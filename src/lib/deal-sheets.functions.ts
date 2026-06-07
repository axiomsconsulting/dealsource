import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { analyseProperty } from "@/lib/analysis/engine";

export const createOrUpdateDealSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    propertyId: z.string().uuid(),
    redact: z.boolean().optional(),
    is_public: z.boolean().optional(),
    overrides: z.record(z.any()).optional(),
    heroPhotoId: z.string().uuid().nullable().optional(),
    title: z.string().max(200).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prop, error: pe } = await context.supabase
      .from("properties").select("*").eq("id", data.propertyId).maybeSingle();
    if (pe || !prop) throw new Error("Property not found");
    const { data: persona } = await context.supabase
      .from("personas").select("*").eq("user_id", context.userId).eq("is_default", true).maybeSingle();
    if (!persona) throw new Error("No default persona");
    const { data: aiRow } = await context.supabase
      .from("analyses").select("ai_notes, ai_used_at")
      .eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    const { data: photos } = await context.supabase
      .from("photos").select("id, storage_path, caption, is_exterior").eq("property_id", data.propertyId);

    const analysis = analyseProperty(prop as any, persona as any, (data.overrides as any) ?? {});
    const snapshot = {
      property: {
        address: prop.address, postcode: prop.postcode, city: prop.city,
        beds: prop.beds, baths: prop.baths, property_type: prop.property_type,
        epc_rate: prop.epc_rate, tenure: prop.tenure, area_sqm: prop.area_sqm,
        asking_price_gbp: prop.asking_price_gbp, source_link: prop.source_link,
      },
      analysis,
      ai: aiRow?.ai_notes ?? null,
      photoIds: (photos ?? []).map((p) => p.id),
      generatedAt: new Date().toISOString(),
    };

    const { data: existing } = await context.supabase
      .from("deal_sheets").select("id").eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();

    if (existing) {
      const { data: row, error } = await context.supabase.from("deal_sheets").update({
        snapshot, redact: data.redact ?? true, is_public: data.is_public ?? true,
      hero_photo_id: data.heroPhotoId ?? null, title: data.title ?? prop.address,
      snapshot: snapshot as any,
      }).eq("id", existing.id).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase.from("deal_sheets").insert({
      user_id: context.userId, property_id: data.propertyId, snapshot,
      redact: data.redact ?? true, is_public: data.is_public ?? true,
      hero_photo_id: data.heroPhotoId ?? null, title: data.title ?? prop.address,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getMyDealSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("deal_sheets").select("*").eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    return row ?? null;
  });

export const getPublicDealSheet = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("deal_sheets").select("*").eq("share_token", data.token).eq("is_public", true).maybeSingle();
    if (error || !row) return null;
    // signed urls for any photos in snapshot
    const ids: string[] = ((row.snapshot as any)?.photoIds ?? []).slice(0, 12);
    let photos: { id: string; url: string; is_exterior: boolean }[] = [];
    if (ids.length) {
      const { data: ph } = await supabaseAdmin.from("photos").select("id, storage_path, is_exterior").in("id", ids);
      photos = await Promise.all((ph ?? []).map(async (p) => {
        const { data: signed } = await supabaseAdmin.storage.from("property-photos").createSignedUrl(p.storage_path, 60 * 60 * 24);
        return { id: p.id, url: signed?.signedUrl ?? "", is_exterior: p.is_exterior };
      }));
    }
    return { ...row, photos };
  });