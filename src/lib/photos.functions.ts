import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("photos")
      .select("*")
      .eq("property_id", data.propertyId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const withUrls = await Promise.all(
      (rows ?? []).map(async (p) => {
        const { data: signed } = await context.supabase.storage
          .from("property-photos")
          .createSignedUrl(p.storage_path, 60 * 60);
        return { ...p, url: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

export const addPhotoRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      propertyId: z.string().uuid(),
      photos: z.array(z.object({
        storage_path: z.string().max(500),
        caption: z.string().max(200).optional().nullable(),
        is_exterior: z.boolean().optional(),
        issue_key: z.string().max(50).optional().nullable(),
      })).min(1).max(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const rows = data.photos.map((p) => ({
      user_id: context.userId,
      property_id: data.propertyId,
      storage_path: p.storage_path,
      caption: p.caption ?? null,
      is_exterior: p.is_exterior ?? false,
      issue_key: p.issue_key ?? null,
    }));
    const { data: inserted, error } = await context.supabase
      .from("photos").insert(rows).select("id, storage_path");
    if (error) throw new Error(error.message);
    return { inserted: inserted ?? [] };
  });

export const deletePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("photos").select("storage_path").eq("id", data.id).maybeSingle();
    if (row?.storage_path) {
      await context.supabase.storage.from("property-photos").remove([row.storage_path]);
    }
    const { error } = await context.supabase.from("photos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });