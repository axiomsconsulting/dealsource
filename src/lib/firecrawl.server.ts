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
  /** ISO date (yyyy-mm-dd) of the most recent "Reduced on dd/mm/yyyy" badge, lifted from
   *  Rightmove's embedded PAGE_MODEL data — used as price-reduction evidence in the negotiation
   *  playbook (mirrors `pf_json.propertyLight.multipleReduce`). Null if not a reduced listing. */
  price_reduced_date: string | null;
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
      formats: ["markdown", "links", "rawHtml", { type: "json", prompt: EXTRACT_PROMPT }],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const root = body?.data ?? body;
  const j = root?.json ?? root?.extract ?? {};
  const pm = deriveFromRightmovePageModel(extractRightmovePageModel(root?.rawHtml ?? root?.html));

  const address = j.address ? String(j.address) : (pm?.address ?? deriveAddressFromText(root));
  const postcode = j.postcode
    ? String(j.postcode).toUpperCase()
    : (pm?.postcode ?? derivePostcodeFromText(root, address));

  return {
    address,
    postcode,
    // Rightmove's price often doesn't survive the markdown/LLM extraction (it's rendered as a
    // styled element rather than plain text) — PAGE_MODEL.propertyData.prices.primaryPrice is the
    // ground-truth figure straight from the page's own data, so it takes priority here.
    asking_price_gbp: pm?.asking_price_gbp ?? numOrNull(j.price ?? j.asking_price ?? j.asking_price_gbp),
    property_type: (j.property_type ?? j.type) ? String(j.property_type ?? j.type) : null,
    beds: numOrNull(j.bedrooms ?? j.beds),
    baths: numOrNull(j.bathrooms ?? j.baths),
    tenure: j.tenure ? String(j.tenure) : null,
    lease_years_remaining: numOrNull(j.lease_years_remaining ?? j.leaseYears),
    epc_rate: (j.epc ?? j.epc_rating ?? j.epcRate) ? String(j.epc ?? j.epc_rating ?? j.epcRate).toUpperCase().slice(0, 1) : null,
    area_sqm: numOrNull(j.area_sqm ?? j.area),
    agent_name: (j.agent ?? j.agent_name) ? String(j.agent ?? j.agent_name) : null,
    image_urls: collectImages(root, j),
    price_reduced_date: pm?.price_reduced_date ?? null,
  };
}

/** Extracts the `window.PAGE_MODEL = {...}` JSON blob Rightmove embeds in every property page's
 *  source — this is the same structured data the page's own React app renders from, so it
 *  carries the full display address, exact price and "Reduced on dd/mm/yyyy" listing-history
 *  reason without any of the markdown/LLM-extraction guesswork. Returns null for non-Rightmove
 *  pages or if Firecrawl didn't return raw HTML. */
function extractRightmovePageModel(html: string | null | undefined): any | null {
  if (!html) return null;
  const marker = "window.PAGE_MODEL";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;
  const eqIdx = html.indexOf("=", markerIdx);
  const openIdx = html.indexOf("{", eqIdx);
  if (eqIdx === -1 || openIdx === -1) return null;

  let depth = 0, inString = false, quote = "", escaped = false;
  for (let i = openIdx; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(openIdx, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

const FULL_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

function deriveFromRightmovePageModel(pageModel: any): {
  address: string | null;
  postcode: string | null;
  asking_price_gbp: number | null;
  price_reduced_date: string | null;
} | null {
  const pd = pageModel?.propertyData;
  if (!pd) return null;

  const address = pd.address?.displayAddress ? String(pd.address.displayAddress) : null;

  const outcode = pd.address?.outcode ? String(pd.address.outcode) : null;
  const incode = pd.address?.incode ? String(pd.address.incode) : null;
  let postcode = outcode && incode ? `${outcode} ${incode}`.toUpperCase() : null;
  if (!postcode || !FULL_POSTCODE_RE.test(postcode)) postcode = derivePostcodeFromText(null, address) ?? postcode;

  const priceStr = pd.prices?.primaryPrice ?? pd.prices?.displayPrice;
  const asking_price_gbp = priceStr != null ? numOrNull(String(priceStr).replace(/[^0-9.]/g, "")) : null;

  let price_reduced_date: string | null = null;
  const reason = pageModel?.propertyData?.listingHistory?.listingUpdateReason;
  if (typeof reason === "string" && /reduced/i.test(reason)) {
    const m = reason.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) price_reduced_date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  return { address, postcode, asking_price_gbp, price_reduced_date };
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
