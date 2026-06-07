import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parsePropertyFilterJson } from "./parsers/json";

const RIGHTMOVE_HOSTS = /rightmove\.co\.uk|zoopla\.co\.uk|onthemarket\.com|boomin\.com|primelocation\.com/i;

export const enrichFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ propertyId: z.string().uuid(), url: z.string().url() }).parse(i))
  .handler(async ({ data, context }) => {
    if (!RIGHTMOVE_HOSTS.test(data.url)) throw new Error("URL must be a Rightmove, Zoopla, OnTheMarket, Boomin or PrimeLocation listing.");
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) throw new Error("Firecrawl is not connected — link it in Connectors to enable URL enrichment.");

    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        url: data.url,
        formats: ["markdown", "links", { type: "json", prompt: "Extract: full address, postcode, asking price (GBP), property type (terraced/semi/detached/flat/bungalow), number of bedrooms, number of bathrooms, tenure (Freehold/Leasehold), lease years remaining if shown, EPC rating, floor area in m², agent name, image URLs (jpg/png). Return null for unknowns." }],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
    const body = await res.json();
    const root = body?.data ?? body;
    const j = root?.json ?? root?.extract ?? {};
    const imgs = collectImages(root, j);

    const patch: any = {};
    if (j.address) patch.address = j.address;
    if (j.postcode) patch.postcode = String(j.postcode).toUpperCase();
    if (j.price ?? j.asking_price ?? j.asking_price_gbp) patch.asking_price_gbp = Number(j.price ?? j.asking_price ?? j.asking_price_gbp);
    if (j.property_type ?? j.type) patch.property_type = String(j.property_type ?? j.type);
    if (j.bedrooms ?? j.beds) patch.beds = Number(j.bedrooms ?? j.beds);
    if (j.bathrooms ?? j.baths) patch.baths = Number(j.bathrooms ?? j.baths);
    if (j.tenure) patch.tenure = String(j.tenure);
    if (j.lease_years_remaining ?? j.leaseYears) patch.lease_years_remaining = Number(j.lease_years_remaining ?? j.leaseYears);
    if (j.epc ?? j.epc_rating ?? j.epcRate) patch.epc_rate = String(j.epc ?? j.epc_rating ?? j.epcRate).toUpperCase().slice(0, 1);
    if (j.area_sqm ?? j.area) patch.area_sqm = Number(j.area_sqm ?? j.area);
    if (j.agent ?? j.agent_name) patch.agent_name = String(j.agent ?? j.agent_name);
    if (imgs.length) patch.image_urls = imgs;
    patch.source_link = data.url;

    if (!Object.keys(patch).length) throw new Error("Could not extract listing data from that URL.");

    const { error } = await context.supabase.from("properties").update(patch).eq("id", data.propertyId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, fieldsUpdated: Object.keys(patch), imageCount: imgs.length };
  });

function collectImages(root: any, j: any): string[] {
  const out = new Set<string>();
  const push = (v: any) => {
    if (!v) return;
    if (typeof v === "string" && /^https?:\/\//.test(v) && /\.(jpe?g|png|webp)/i.test(v)) out.add(v);
  };
  (j?.image_urls ?? j?.images ?? []).forEach?.(push);
  (root?.links ?? []).forEach?.(push);
  const md = root?.markdown ?? "";
  const re = /!\[[^\]]*\]\((https?:\/\/[^\s)]+\.(?:jpe?g|png|webp))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) out.add(m[1]);
  return Array.from(out).slice(0, 30);
}

export const enrichFromPfJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ propertyId: z.string().uuid(), json: z.string().min(2).max(500_000) }).parse(i))
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
    setIfMissing("address", parsed.address);
    setIfMissing("postcode", parsed.postcode);
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

    const { error } = await context.supabase.from("properties").update(patch).eq("id", data.propertyId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, fieldsUpdated: Object.keys(patch).filter((k) => k !== "pf_json"), imageCount: parsed.image_urls.length, totalImages: merged.length };
  });