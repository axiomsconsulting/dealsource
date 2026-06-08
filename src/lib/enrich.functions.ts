import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parsePropertyFilterJson } from "./parsers/json";
import { assertSupportedListingUrl, scrapeListing } from "./firecrawl.server";

export const enrichFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid(), url: z.string().url() }).parse(i))
  .handler(async ({ data, context }) => {
    assertSupportedListingUrl(data.url);
    const scraped = await scrapeListing(data.url);

    const patch: any = {};
    if (scraped.address) patch.address = scraped.address;
    if (scraped.postcode) patch.postcode = scraped.postcode;
    if (scraped.asking_price_gbp != null) patch.asking_price_gbp = scraped.asking_price_gbp;
    if (scraped.property_type) patch.property_type = scraped.property_type;
    if (scraped.beds != null) patch.beds = scraped.beds;
    if (scraped.baths != null) patch.baths = scraped.baths;
    if (scraped.tenure) patch.tenure = scraped.tenure;
    if (scraped.lease_years_remaining != null) patch.lease_years_remaining = scraped.lease_years_remaining;
    if (scraped.epc_rate) patch.epc_rate = scraped.epc_rate;
    if (scraped.area_sqm != null) patch.area_sqm = scraped.area_sqm;
    if (scraped.agent_name) patch.agent_name = scraped.agent_name;
    if (scraped.image_urls.length) patch.image_urls = scraped.image_urls;
    patch.source_link = data.url;

    if (!Object.keys(patch).length) throw new Error("Could not extract listing data from that URL.");

    const { error } = await context.supabase.from("properties").update(patch).eq("id", data.propertyId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, fieldsUpdated: Object.keys(patch), imageCount: scraped.image_urls.length };
  });

export const enrichFromPfJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid(), json: z.string().min(2).max(500_000) }).parse(i))
  .handler(async ({ data, context }) => {
    const parsed = parsePropertyFilterJson(data.json);
    if (!parsed) throw new Error("Could not parse Property Filter JSON.");

    const { data: existingRow, error: ge } = await context.supabase
      .from("properties").select("*").eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    const existing: any = existingRow;
    if (ge || !existing) throw new Error("Property not found");

    const patch: any = {};
    const setIfMissing = (field: string, value: any) => {
      if (value == null || value === "") return;
      if (existing[field] == null || existing[field] === "") patch[field] = value;
    };
    // URL scrapes routinely land a coarse address/postcode (agent portals withhold the house
    // number — e.g. "Newcombe Road, Northampton, NN5" / "NN5"). setIfMissing alone would leave
    // that coarse value in place forever once it's set. Property Filter JSON nearly always carries
    // the full postal address, so when it does — and it's strictly more complete than what's
    // there — let it upgrade the existing value. The EPC register match requires a full postcode,
    // so this directly unblocks EPC lookups on properties that started life as a URL scrape.
    const refineIfBetter = (field: string, value: any, isBetter: (cur: string) => boolean) => {
      if (value == null || value === "") return;
      const cur = existing[field];
      if (cur == null || cur === "" || isBetter(String(cur))) patch[field] = value;
    };
    const FULL_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
    refineIfBetter("address", parsed.address, (cur) => !/^\d/.test(cur.trim()) && /^\d/.test(String(parsed.address).trim()));
    refineIfBetter("postcode", parsed.postcode, (cur) => !FULL_POSTCODE_RE.test(cur) && FULL_POSTCODE_RE.test(String(parsed.postcode)));
    setIfMissing("beds", parsed.beds);
    setIfMissing("baths", parsed.baths);
    setIfMissing("property_type", parsed.property_type);
    setIfMissing("epc_rate", parsed.epc_rate);
    setIfMissing("tenure", parsed.tenure);
    setIfMissing("area_sqm", parsed.area_sqm);
    setIfMissing("asking_price_gbp", parsed.asking_price_gbp);
    setIfMissing("estimated_rent_pcm", parsed.estimated_rent_pcm);
    if (parsed.estimated_rent_pcm) patch.rent_source = "pf_json";
    if (parsed.lease_years_remaining != null) setIfMissing("lease_years_remaining", parsed.lease_years_remaining);
    // Merge images
    const oldImgs: string[] = Array.isArray(existing.image_urls) ? existing.image_urls : [];
    const merged = Array.from(new Set([...oldImgs, ...parsed.image_urls])).slice(0, 60);
    if (merged.length !== oldImgs.length) patch.image_urls = merged;
    patch.pf_json = parsed.pf_json;

    // EPC data from the listing JSON — saves current/potential band and SAP score into epc_data
    // WITHOUT overwriting a richer register fetch already on file (cert number + improvement
    // roadmap). The register fetch later enriches this entry rather than replacing it wholesale.
    if (parsed.epc_from_json) {
      const existingEpc = existing.epc_data;
      const hasRegisterData = existingEpc && existingEpc.source !== "pf_json" && existingEpc.certificateNumber;
      if (!hasRegisterData) {
        // Merge: if register data exists (cert + recommendations) keep those, only update scores/bands
        patch.epc_data = hasRegisterData
          ? { ...existingEpc, ...parsed.epc_from_json, certificateNumber: existingEpc.certificateNumber, certificateUrl: existingEpc.certificateUrl, recommendations: existingEpc.recommendations, elements: existingEpc.elements }
          : { ...parsed.epc_from_json, certificateNumber: null, certificateUrl: null, recommendations: [], elements: [] };
        if (!existing.epc_fetched_at) patch.epc_fetched_at = new Date().toISOString();
      }
    }

    const { error } = await context.supabase.from("properties").update(patch).eq("id", data.propertyId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const countedFields = Object.keys(patch).filter((k) => k !== "pf_json");
    return {
      ok: true,
      fieldsUpdated: countedFields,
      imageCount: parsed.image_urls.length,
      totalImages: merged.length,
      epcFromJson: !!parsed.epc_from_json,
      marketComparables: parsed.market_data?.soldComparables.length ?? 0,
    };
  });