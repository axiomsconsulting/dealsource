import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { cleanListingUrl } from "./listing-url";
import { computeRiskFlags } from "./analysis/risk";
import { lookupArticle4WithClient } from "./analysis/article4";
import { estimateRefurb } from "./analysis/refurb";

/** Validates + cleans a Rightmove search URL, fetches the results page and returns a
 *  slim list for the user to review. No Firecrawl credits are spent — the page's own
 *  __NEXT_DATA__ JSON has everything we need. */
export const previewSearchUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().min(1).max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const cleaned = cleanListingUrl(data.url);
    if (cleaned.host !== "rightmove" || cleaned.kind !== "search") {
      throw new Error("Only Rightmove search URLs are supported for bulk preview right now.");
    }
    const { scrapeRightmoveSearch } = await import("./search-scrape.server");
    return scrapeRightmoveSearch(cleaned.url);
  });

const SearchItemSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  address: z.string().min(1).max(500),
  postcode: z.string().max(20).nullable(),
  asking_price_gbp: z.number().nullable(),
  price_qualifier: z.string().max(60).nullable(),
  property_type: z.string().max(80).nullable(),
  beds: z.number().int().nullable(),
  baths: z.number().int().nullable(),
  image_urls: z.array(z.string().url()).max(20),
  summary: z.string().max(4000).nullable(),
  agent_name: z.string().max(200).nullable(),
  is_auction: z.boolean().optional().default(false),
});

/** Inserts a single property using already-scraped search summary data. Called once
 *  per selected row by the client so the UI can drive a per-item progress bar AND
 *  the throttle delay (set in admin settings) sits between calls. Skips silently if
 *  the same source_link is already in the user's library. */
export const ingestSearchProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ item: SearchItemSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const it = data.item;

    // De-dupe per user by source_link so re-clicking "Add all" never duplicates rows
    const { data: existing } = await context.supabase
      .from("properties")
      .select("id, address")
      .eq("user_id", context.userId)
      .eq("source_link", it.url)
      .maybeSingle();
    if (existing) return { property: existing, skipped: true as const };

    const propInput: any = {
      address: it.address,
      postcode: it.postcode,
      property_type: it.property_type,
      beds: it.beds,
      baths: it.baths,
      asking_price_gbp: it.asking_price_gbp,
      price_qualifier: it.price_qualifier,
      agent_name: it.agent_name,
      image_urls: it.image_urls,
      source: "rightmove_search",
      source_link: it.url,
      is_auction: it.is_auction,
    };
    const risks = computeRiskFlags(propInput);
    const a4 = await lookupArticle4WithClient(context.supabase, it.postcode);
    const refurb = estimateRefurb(propInput, "medium");
    const row = {
      address: it.address,
      postcode: it.postcode,
      property_type: it.property_type,
      beds: it.beds,
      baths: it.baths,
      asking_price_gbp: it.asking_price_gbp,
      price_qualifier: it.price_qualifier,
      agent_name: it.agent_name,
      image_urls: it.image_urls,
      source: "rightmove_search",
      source_link: it.url,
      user_id: context.userId,
      risk_flags: { flags: risks, computed_at: new Date().toISOString() } as any,
      article4_status: a4.status,
      article4_source: a4.status !== "unknown" ? "cache" : null,
      refurb_estimate: refurb as any,
    };
    const { data: inserted, error } = await context.supabase
      .from("properties")
      .insert(row)
      .select("id, address")
      .single();
    if (error) throw new Error(error.message);
    return { property: inserted, skipped: false as const };
  });

/** Reads the global "search ingest" admin settings (max per batch, throttle, allow-all). */
export const getSearchIngestSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("value")
      .eq("key", "search_ingest")
      .maybeSingle();
    const v = (data?.value as any) ?? {};
    return {
      max_per_batch: typeof v.max_per_batch === "number" ? v.max_per_batch : 10,
      throttle_ms: typeof v.throttle_ms === "number" ? v.throttle_ms : 2500,
      allow_all: !!v.allow_all,
    };
  });

/** Admin-only update for the search-ingest controls. RLS on app_settings already
 *  enforces admin-only writes, so this just forwards the patch through. */
export const updateSearchIngestSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        max_per_batch: z.number().int().min(1).max(50),
        throttle_ms: z.number().int().min(500).max(15000),
        allow_all: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("app_settings")
      .upsert(
        {
          key: "search_ingest",
          value: data as any,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });