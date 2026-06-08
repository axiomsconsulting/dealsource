import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface Article4LookupResult {
  status: "inside" | "unknown";
  areas: Array<{ name: string; reference: string; council?: string; dataset: string }>;
  postcode: string;
  lat: number;
  lon: number;
  lookupSource: "planning-data-api";
}

/** Resolve postcode → lat/lon via postcodes.io (no auth needed). */
async function resolvePostcode(postcode: string): Promise<{ lat: number; lon: number } | null> {
  const encoded = encodeURIComponent(postcode.trim().toUpperCase());
  const r = await fetch(`https://api.postcodes.io/postcodes/${encoded}`);
  if (!r.ok) return null;
  const body = await r.json();
  const lat = body?.result?.latitude;
  const lon = body?.result?.longitude;
  if (!lat || !lon) return null;
  return { lat, lon };
}

/** Query the UK Planning Data API for Article 4 direction areas intersecting a point. */
async function queryPlanningDataApi(lat: number, lon: number): Promise<Article4LookupResult["areas"]> {
  const geometry = `POINT(${lon} ${lat})`;
  const params = new URLSearchParams({
    dataset: "article-4-direction-area",
    geometry_relation: "intersects",
    geometry,
    entries: "current",
    limit: "20",
    fields: "name,reference,organisation-entity,dataset",
  });
  const url = `https://www.planning.data.gov.uk/entity.json?${params}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) return [];
  const body = await r.json();
  const entities: any[] = body?.entities ?? [];
  return entities.map((e: any) => ({
    name: e.name ?? e.reference ?? "Article 4 direction",
    reference: e.reference ?? "",
    council: e["organisation-entity"] ?? undefined,
    dataset: e.dataset ?? "article-4-direction-area",
  }));
}

/** Look up Article 4 status for a postcode using free UK government APIs. */
export const lookupArticle4ByPostcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ postcode: z.string().min(4).max(8), propertyId: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const coords = await resolvePostcode(data.postcode);
    if (!coords) throw new Error(`Postcode '${data.postcode}' not found — check spelling and try again.`);

    const areas = await queryPlanningDataApi(coords.lat, coords.lon);

    const result: Article4LookupResult = {
      status: areas.length > 0 ? "inside" : "unknown",
      areas,
      postcode: data.postcode.trim().toUpperCase(),
      lat: coords.lat,
      lon: coords.lon,
      lookupSource: "planning-data-api",
    };

    // If a propertyId was supplied, persist the verified status to the DB so future analyses pick it up.
    if (data.propertyId && result.status !== "unknown") {
      await context.supabase
        .from("properties")
        .update({ article4_status: result.status })
        .eq("id", data.propertyId)
        .eq("user_id", context.userId);
    }

    return result;
  });

/** Fetch the current Article 4 status for a property (reads from DB, does NOT call the API). */
export const getArticle4Status = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("properties")
      .select("article4_status, postcode")
      .eq("id", data.propertyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { article4_status: row?.article4_status ?? null, postcode: row?.postcode ?? null };
  });
