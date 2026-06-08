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
  "Extract: address (use whatever address text the page displays — many listings show only a street/area name and postcode district with no house number, e.g. 'Newcombe Road, Northampton, NN5'; return that partial address rather than null — only return null if there is truly no location text at all), postcode (a postcode district/outcode like 'NN5' is fine if the full postcode is not shown), asking price (GBP), property type (terraced/semi/detached/flat/bungalow), number of bedrooms, number of bathrooms, tenure (Freehold/Leasehold), lease years remaining if shown, EPC rating, floor area in m², agent name, image URLs (jpg/png). Return null for unknowns.";

/** Rightmove/Zoopla/etc. listing pages routinely withhold the exact house number and show only
 *  "<street/area>, <town>, <postcode district>" — and the page <title>/og:description nearly always
 *  reads "<n> bedroom <type> for sale in <that address> for £<price>". When the LLM extraction comes
 *  back empty (e.g. it over-indexes on "address" meaning a full postal address), recover the same
 *  string straight from that boilerplate so a real, if partial, address still reaches the user. */
function deriveAddressFromText(root: any): string | null {
  const text = [
    root?.metadata?.title, root?.metadata?.ogTitle,
    root?.metadata?.description, root?.metadata?.ogDescription,
    typeof root?.markdown === "string" ? root.markdown.slice(0, 4000) : "",
  ].filter(Boolean).join("\n");
  const m = text.match(/for sale in ([^£\n]+?)(?:[.\n]|£|$)/i);
  if (!m) return null;
  // Trim the price-intro filler ("for", "for offers over", "guide price", …) the capture
  // swallows when the price sits right after the address with no separating punctuation.
  const addr = m[1].replace(/[\s,]*(?:for\s+)?(?:offers?\s*(?:over|in\s+excess\s+of|in\s+the\s+region\s+of)?|guide\s+price|asking\s+price|from)?\s*$/i, "").trim();
  return addr || null;
}

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})?\b/i;

function derivePostcodeFromText(root: any, address: string | null): string | null {
  const text = [address, root?.metadata?.title, root?.metadata?.description, root?.metadata?.ogDescription].filter(Boolean).join(" ");
  const m = text.match(POSTCODE_RE);
  if (!m) return null;
  return (m[2] ? `${m[1]} ${m[2]}` : m[1]).toUpperCase();
}

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

  const address = j.address ? String(j.address) : deriveAddressFromText(root);
  const postcode = j.postcode ? String(j.postcode).toUpperCase() : derivePostcodeFromText(root, address);

  return {
    address,
    postcode,
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
