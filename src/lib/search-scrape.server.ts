/**
 * Direct (no-Firecrawl) scrape of a Rightmove search-results page. The page ships its full
 * results array as JSON in `<script id="__NEXT_DATA__">`, so a single `fetch` with a
 * browser-like User-Agent gives us address, price, beds/baths, images, type, distance, and
 * the listing's own canonical URL — no LLM extraction needed and zero Firecrawl credits.
 */

export interface SearchResultItem {
  /** Rightmove (or other host) numeric id. */
  id: string;
  url: string;
  address: string;
  postcode: string | null;
  asking_price_gbp: number | null;
  price_qualifier: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  image_urls: string[];
  summary: string | null;
  agent_name: string | null;
  is_auction: boolean;
  is_development: boolean;
  is_commercial: boolean;
  is_students: boolean;
  distance_miles: number | null;
  added_or_reduced: string | null;
}

export interface SearchScrapeResult {
  source: "rightmove";
  url: string;
  total: number;
  items: SearchResultItem[];
  location: string | null;
}

const RM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function scrapeRightmoveSearch(url: string): Promise<SearchScrapeResult> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": RM_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(
      `Rightmove returned ${res.status} for that search URL. The link may be expired or rate-limited.`,
    );
  }
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Couldn't read the search results from that page. Is it a Rightmove search URL?");

  let next: any;
  try { next = JSON.parse(m[1]); } catch { throw new Error("Search page contained unreadable data."); }

  const sr = next?.props?.pageProps?.searchResults;
  const properties: any[] = Array.isArray(sr?.properties) ? sr.properties : [];
  const location = sr?.location?.shortDisplayName ?? sr?.searchableLocation?.displayName ?? null;

  const items: SearchResultItem[] = properties
    // Drop carousel/sponsored placeholder rows that lack a real id or display address
    .filter((p) => p && typeof p.id !== "undefined" && p.displayAddress)
    .map((p): SearchResultItem => {
      const id = String(p.id);
      return {
        id,
        url: `https://www.rightmove.co.uk/properties/${id}`,
        address: String(p.displayAddress).replace(/\s+/g, " ").trim(),
        postcode: extractPostcode(p.displayAddress) ?? null,
        asking_price_gbp: typeof p?.price?.amount === "number" ? p.price.amount : null,
        price_qualifier: p?.price?.displayPrices?.[0]?.displayPriceQualifier || null,
        property_type: p?.propertySubType ? String(p.propertySubType) : null,
        beds: typeof p?.bedrooms === "number" ? p.bedrooms : null,
        baths: typeof p?.bathrooms === "number" ? p.bathrooms : null,
        image_urls: Array.isArray(p?.images)
          ? p.images.map((im: any) => im?.srcUrl).filter((s: any) => typeof s === "string").slice(0, 12)
          : [],
        summary: p?.summary ? String(p.summary) : null,
        agent_name: p?.customer?.brandTradingName ? String(p.customer.brandTradingName) : null,
        is_auction: !!p?.auction,
        is_development: !!p?.development,
        is_commercial: !!p?.commercial,
        is_students: !!p?.students,
        distance_miles: typeof p?.distance === "number" ? p.distance : null,
        added_or_reduced: p?.listingUpdate?.listingUpdateReason ? String(p.listingUpdate.listingUpdateReason) : null,
      };
    });

  return { source: "rightmove", url, total: sr?.resultCount ? Number(sr.resultCount) : items.length, items, location };
}

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)(?:\s*(\d[A-Z]{2}))?\b/i;
function extractPostcode(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const m = addr.match(POSTCODE_RE);
  if (!m) return null;
  return (m[2] ? `${m[1]} ${m[2]}` : m[1]).toUpperCase();
}