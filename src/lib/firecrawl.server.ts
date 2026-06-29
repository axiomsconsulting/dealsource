const LISTING_HOSTS = /rightmove\.co\.uk|zoopla\.co\.uk|onthemarket\.com|boomin\.com|primelocation\.com/i;

export interface ScrapedListing {
  address: string | null;
  postcode: string | null;
  asking_price_gbp: number | null;
  /** Rightmove's price label ("Guide Price", "Offers Over", "Offers in Region of", "POA",
   *  "Auction Guide", …). Lifted from PAGE_MODEL.propertyData.prices.displayPriceQualifier so
   *  the UI can show the seller's real pricing posture, not just a plain figure. */
  price_qualifier: string | null;
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

export interface ListingSearchResult {
  title: string | null;
  url: string;
  description: string | null;
}

/** Firecrawl web search, filtered to supported property-listing hosts — used to discover real
 *  nearby listing URLs (for sale / under offer / sold) for the market comparables panel. Never
 *  returns invented URLs: every result comes straight from Firecrawl's search index. */
export async function searchListings(query: string, limit = 5): Promise<ListingSearchResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Firecrawl is not connected — link it in Connectors to enable URL enrichment.");

  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) throw new Error(`Firecrawl search ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const root = body?.data ?? body;
  const web: any[] = Array.isArray(root) ? root : (root?.web ?? []);
  return web
    .filter((r) => typeof r?.url === "string" && LISTING_HOSTS.test(r.url))
    .slice(0, limit)
    .map((r) => ({ title: r.title ?? null, url: r.url, description: r.description ?? null }));
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

/** Fetches a Rightmove listing page directly (no Firecrawl) so PAGE_MODEL extraction doesn't
 *  depend on Firecrawl's `onlyMainContent` handling, which can strip the `<script>` tags that
 *  carry it from `rawHtml`. Rightmove serves PAGE_MODEL in the initial server-rendered HTML, so a
 *  plain fetch with a browser-like User-Agent is enough — no JS execution needed. Best-effort:
 *  returns null on any network/HTTP failure and the Firecrawl-derived data is used instead. */
async function fetchRightmoveHtmlDirect(url: string): Promise<string | null> {
  if (!/rightmove\.co\.uk/i.test(url)) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function scrapeListing(url: string): Promise<ScrapedListing> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Firecrawl is not connected — link it in Connectors to enable URL enrichment.");

  const [res, directHtml] = await Promise.all([
    fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        url,
        formats: ["markdown", "links", "rawHtml", { type: "json", prompt: EXTRACT_PROMPT }],
        onlyMainContent: true,
      }),
    }),
    fetchRightmoveHtmlDirect(url),
  ]);
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const root = body?.data ?? body;
  const j = root?.json ?? root?.extract ?? {};
  const pm = deriveFromRightmovePageModel(extractRightmovePageModel(directHtml ?? root?.rawHtml ?? root?.html));

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
    price_qualifier: pm?.price_qualifier ?? null,
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

/** Extracts Rightmove's embedded page-state blob — historically `window.PAGE_MODEL = {...}`,
 *  but now served as `window.__PAGE_MODEL = { data: "<flight-encoded JSON>" }` where `data` is
 *  a stringified array using numeric reference pointers (React Flight-style). This is the same
 *  structured data the page's own React app renders from, so it carries the full display
 *  address, exact price, price qualifier ("Guide Price" / "Offers Over" / …) and the
 *  "Reduced on dd/mm/yyyy" listing-history reason without any markdown/LLM-extraction guesswork.
 *  Returns a "logical" propertyData object (refs resolved) regardless of which format the
 *  page used. Null for non-Rightmove pages or if no embedded blob was returned. */
function extractRightmovePageModel(html: string | null | undefined): any | null {
  if (!html) return null;
  // Try the new __PAGE_MODEL first (Flight-encoded), then legacy PAGE_MODEL.
  const candidates = ["window.__PAGE_MODEL", "window.PAGE_MODEL"];
  for (const marker of candidates) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const eqIdx = html.indexOf("=", idx);
    const openIdx = html.indexOf("{", eqIdx);
    if (eqIdx === -1 || openIdx === -1) continue;
    const raw = sliceBalancedObject(html, openIdx);
    if (!raw) continue;
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { continue; }
    // New flight format: { data: "[...]" } with numeric references.
    if (parsed && typeof parsed.data === "string") {
      try {
        const arr = JSON.parse(parsed.data);
        if (Array.isArray(arr) && arr.length && typeof arr[0] === "object") {
          return resolveFlightRefs(arr, arr[0]);
        }
      } catch {/* fall through */}
    }
    // Legacy format: already a plain object with propertyData.
    if (parsed && parsed.propertyData) return parsed;
  }
  return null;
}

/** Reads one brace-balanced JS object literal starting at `start` (must point at `{`), respecting
 *  string boundaries and escapes. Returns the raw substring or null on EOF. */
function sliceBalancedObject(src: string, start: number): string | null {
  let depth = 0, inString = false, quote = "", escaped = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
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
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/** Walks Rightmove's flight-encoded array. Each numeric value in an object/array slot is a
 *  pointer into the array (`data[n]`); strings/booleans/null are literal. We only resolve the
 *  small subtree we need (prices, address, listingHistory, tenure) so we don't have to think
 *  about whether `data[bedrooms]` is a literal `3` or an index — bedrooms/baths come from
 *  Firecrawl's LLM extraction. Depth-capped to dodge cycles. */
function resolveFlightRefs(arr: any[], node: any, depth = 0): any {
  if (depth > 25) return null;
  if (typeof node === "number" && Number.isInteger(node) && node >= 0 && node < arr.length) {
    return resolveFlightRefs(arr, arr[node], depth + 1);
  }
  if (Array.isArray(node)) return node.map((v) => resolveFlightRefs(arr, v, depth + 1));
  if (node && typeof node === "object") {
    const out: any = {};
    for (const k of Object.keys(node)) out[k] = resolveFlightRefs(arr, (node as any)[k], depth + 1);
    return out;
  }
  return node;
}

const FULL_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

function deriveFromRightmovePageModel(pageModel: any): {
  address: string | null;
  postcode: string | null;
  asking_price_gbp: number | null;
  price_qualifier: string | null;
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

  const rawQualifier = pd.prices?.displayPriceQualifier ?? pd.prices?.priceQualifier ?? null;
  const price_qualifier = rawQualifier && String(rawQualifier).trim() ? String(rawQualifier).trim() : null;

  let price_reduced_date: string | null = null;
  const reason = pageModel?.propertyData?.listingHistory?.listingUpdateReason;
  if (typeof reason === "string" && /reduced/i.test(reason)) {
    const m = reason.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) price_reduced_date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  return { address, postcode, asking_price_gbp, price_qualifier, price_reduced_date };
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
