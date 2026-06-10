import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeRiskFlags } from "./analysis/risk";
import { lookupArticle4WithClient } from "./analysis/article4";
import { estimateRefurb } from "./analysis/refurb";
import { assertSupportedListingUrl, scrapeListing } from "./firecrawl.server";

const PropertyInputSchema = z.object({
  address: z.string().min(1).max(500),
  postcode: z.string().max(20).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  beds: z.number().int().min(0).max(20).nullable().optional(),
  baths: z.number().int().min(0).max(20).nullable().optional(),
  property_type: z.string().max(80).nullable().optional(),
  epc_rate: z.string().max(3).nullable().optional(),
  tenure: z.string().max(60).nullable().optional(),
  area_sqm: z.number().nullable().optional(),
  asking_price_gbp: z.number().nullable().optional(),
  source: z.string().max(40).default("manual"),
  source_link: z.string().max(1000).nullable().optional(),
  agent_name: z.string().max(200).nullable().optional(),
  image_urls: z.array(z.string().url()).max(50).optional(),
  estimated_rent_pcm: z.number().nullable().optional(),
  rent_source: z.string().max(40).nullable().optional(),
  lease_years_remaining: z.number().int().nullable().optional(),
  csv_row: z.any().optional(),
  pf_json: z.any().optional(),
});

export const bulkIngestProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ items: z.array(PropertyInputSchema).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const rows = await Promise.all(data.items.map(async (it) => {
      const propInput: any = { ...it };
      const risks = computeRiskFlags(propInput);
      const a4 = await lookupArticle4WithClient(context.supabase, it.postcode ?? null);
      const refurb = estimateRefurb(propInput, "medium");
      return {
        ...it,
        user_id: context.userId,
        risk_flags: { flags: risks, computed_at: new Date().toISOString() } as any,
        article4_status: a4.status,
        article4_source: a4.status !== "unknown" ? "cache" : null,
        refurb_estimate: refurb as any,
      };
    }));
    const { data: inserted, error } = await context.supabase
      .from("properties")
      .insert(rows)
      .select("id, address");
    if (error) throw new Error(error.message);
    return { inserted: inserted ?? [] };
  });

export const ingestFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    assertSupportedListingUrl(data.url);
    const scraped = await scrapeListing(data.url);
    if (!scraped.address) throw new Error("Could not extract a property address from that listing.");

    const propInput: any = {
      address: scraped.address,
      postcode: scraped.postcode,
      beds: scraped.beds,
      baths: scraped.baths,
      property_type: scraped.property_type,
      epc_rate: scraped.epc_rate,
      tenure: scraped.tenure,
      area_sqm: scraped.area_sqm,
      asking_price_gbp: scraped.asking_price_gbp,
      agent_name: scraped.agent_name,
      lease_years_remaining: scraped.lease_years_remaining,
      image_urls: scraped.image_urls,
      source: "url_scrape",
      source_link: data.url,
    };
    const risks = computeRiskFlags(propInput);
    const a4 = await lookupArticle4WithClient(context.supabase, propInput.postcode ?? null);
    const refurb = estimateRefurb(propInput, "medium");
    const row = {
      ...propInput,
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
    return { property: inserted };
  });

export const mergeJsonIntoProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ propertyId: z.string().uuid(), pf_json: z.any() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("properties")
      .update({ pf_json: data.pf_json })
      .eq("id", data.propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Property not found");

    // Negotiation playbook reads ai_payload.landlordReadiness (white goods / garden clearance,
    // from analysePhotosForRefurb) — it lives on the analyses row, not properties.
    const { data: analysis } = await context.supabase
      .from("analyses").select("ai_payload").eq("property_id", data.id).eq("user_id", context.userId).maybeSingle();
    return { ...row, ai_payload: analysis?.ai_payload ?? null };
  });

export const updateProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        hide_address: z.boolean().optional(),
        notes: z.string().max(5000).optional(),
        asking_price_gbp: z.number().nullable().optional(),
        seller_context: z.any().optional(),
        survey_findings: z.any().optional(),
        refurb_estimate: z.any().optional(),
        estimated_rent_pcm: z.number().nullable().optional(),
      }),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("properties")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("properties").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });