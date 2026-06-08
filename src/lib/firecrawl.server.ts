const LISTING_HOSTS = /rightmove\.co\.uk|zoopla\.co\.uk|onthemarket\.com|boomin\.com|primelocation\.com/i;

export interface ScrapedListing {
  address: string | null;
  postcode: string | null;
  asking_price_gbp: number | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  tenure: string | null;
  lease_years_remaining: number | null;
  epc_rate: string | null;
  area_sqm: number | null;
  agent_name: string | null;
  image_urls: string[];
}

export function assertSupportedListingUrl(url: string) {
  if (!LISTING_HOSTS.test(url)) {
    throw new Error("URL must be a Rightmove, Zoopla, OnTheMarket, Boomin or PrimeLocation listing.");
  }
}

const EXTRACT_PROMPT =
  "Extract: full address, postcode, asking price (GBP), property type (terraced/semi/detached/flat/bungalow), number of bedrooms, number of bathrooms, tenure (Freehold/Leasehold), lease years remaining if shown, EPC rating, floor area in m², agent name, image URLs (jpg/png). Return null for unknowns.";

export async function scrapeListing(url: string): Promise<ScrapedListing> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Firecrawl is not connected — link it in Connectors to enable URL enrichment.");

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      url,
      formats: ["markdown", "links", { type: "json", prompt: EXTRACT_PROMPT }],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const root = body?.data ?? body;
  const j = root?.json ?? root?.extract ?? {};

  return {
    address: j.address ? String(j.address) : null,
    postcode: j.postcode ? String(j.postcode).toUpperCase() : null,
    asking_price_gbp: numOrNull(j.price ?? j.asking_price ?? j.asking_price_gbp),
    property_type: (j.property_type ?? j.type) ? String(j.property_type ?? j.type) : null,
    beds: numOrNull(j.bedrooms ?? j.beds),
    baths: numOrNull(j.bathrooms ?? j.baths),
    tenure: j.tenure ? String(j.tenure) : null,
    lease_years_remaining: numOrNull(j.lease_years_remaining ?? j.leaseYears),
    epc_rate: (j.epc ?? j.epc_rating ?? j.epcRate) ? String(j.epc ?? j.epc_rating ?? j.epcRate).toUpperCase().slice(0, 1) : null,
    area_sqm: numOrNull(j.area_sqm ?? j.area),
    agent_name: (j.agent ?? j.agent_name) ? String(j.agent ?? j.agent_name) : null,
    image_urls: collectImages(root, j),
  };
}

function numOrNull(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
