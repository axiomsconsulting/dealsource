/**
 * Cleans and validates property-listing URLs (Rightmove, Zoopla, OnTheMarket, …) BEFORE
 * any Firecrawl credit is spent. Strips tracking junk, normalises the host, and tells the
 * caller whether it points at a single property or a search/results page so the right
 * pipeline is used.
 */

export type ListingUrlKind = "property" | "search" | "unknown";

export interface CleanedListingUrl {
  url: string;
  host: "rightmove" | "zoopla" | "onthemarket" | "boomin" | "primelocation" | "unknown";
  kind: ListingUrlKind;
  /** Property id for Rightmove `/properties/<id>` URLs — handy for de-duping search results. */
  propertyId: string | null;
}

/** Drops marketing/session params that bloat URLs but never change which listing is shown. */
const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|_branch|ref|source|channel|igshid|s_kwcid|cid)/i;

export function cleanListingUrl(input: string): CleanedListingUrl {
  const trimmed = (input ?? "").trim();
  if (!trimmed) throw new Error("Please paste a listing URL.");

  let withProto = trimmed;
  if (!/^https?:\/\//i.test(withProto)) withProto = `https://${withProto}`;

  let u: URL;
  try { u = new URL(withProto); } catch { throw new Error("That doesn't look like a valid URL."); }

  // Strip tracking params; keep meaningful filters (searchLocation, locationIdentifier, radius, propertyTypes, _includeSSTC, …)
  const keptParams = new URLSearchParams();
  for (const [k, v] of u.searchParams.entries()) {
    if (TRACKING_PARAMS.test(k)) continue;
    keptParams.append(k, v);
  }

  const host = classifyHost(u.hostname);
  const path = u.pathname.replace(/\/+$/, "");
  const kind = classifyKind(host, path);
  const propertyId = host === "rightmove" ? extractRightmovePropertyId(path) : null;

  // Canonicalise host (no www variations across the codebase)
  const cleanHost = u.hostname.replace(/^www\./i, "");
  const search = keptParams.toString();
  const cleaned = `https://${cleanHost}${path}${search ? `?${search}` : ""}`;

  return { url: cleaned, host, kind, propertyId };
}

function classifyHost(hostname: string): CleanedListingUrl["host"] {
  const h = hostname.toLowerCase();
  if (h.includes("rightmove.co.uk")) return "rightmove";
  if (h.includes("zoopla.co.uk")) return "zoopla";
  if (h.includes("onthemarket.com")) return "onthemarket";
  if (h.includes("boomin.com")) return "boomin";
  if (h.includes("primelocation.com")) return "primelocation";
  return "unknown";
}

function classifyKind(host: CleanedListingUrl["host"], path: string): ListingUrlKind {
  if (host === "unknown") return "unknown";
  // Rightmove: /properties/<id> = single, /property-for-sale/find.html or /property-to-rent/find.html = search
  if (host === "rightmove") {
    if (/^\/properties\/\d+/.test(path)) return "property";
    if (/^\/property-(for-sale|to-rent)\/find\.html/.test(path)) return "search";
  }
  // Zoopla: /for-sale/details/<id>/ = single, /for-sale/property/... = search
  if (host === "zoopla") {
    if (/^\/(for-sale|to-rent)\/details\/\d+/.test(path)) return "property";
    if (/^\/(for-sale|to-rent)\/property\//.test(path)) return "search";
  }
  // OnTheMarket: /details/<id> single
  if (host === "onthemarket" && /^\/details\/\d+/.test(path)) return "property";
  // Fallback: any path with a numeric id segment is probably a property
  if (/\/\d{6,}/.test(path)) return "property";
  return "unknown";
}

function extractRightmovePropertyId(path: string): string | null {
  const m = path.match(/\/properties\/(\d+)/);
  return m ? m[1] : null;
}

/** Strict guard for the single-URL ingest path — throws a user-readable error if the URL
 *  cannot be cleanly resolved to a single property listing. */
export function assertSinglePropertyUrl(input: string): CleanedListingUrl {
  const c = cleanListingUrl(input);
  if (c.host === "unknown") {
    throw new Error("URL must be a Rightmove, Zoopla, OnTheMarket, Boomin or PrimeLocation listing.");
  }
  if (c.kind === "search") {
    throw new Error("That's a search results URL. Use the Search tab to preview and pick properties from it.");
  }
  if (c.kind !== "property") {
    throw new Error("Couldn't recognise that as a single property listing URL. Open the listing on the site and copy the address bar.");
  }
  return c;
}