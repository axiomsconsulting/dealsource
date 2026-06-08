export interface ParsedJsonProperty {
  address: string;
  postcode: string | null;
  beds: number | null;
  baths: number | null;
  property_type: string | null;
  epc_rate: string | null;
  tenure: string | null;
  area_sqm: number | null;
  asking_price_gbp: number | null;
  image_urls: string[];
  estimated_rent_pcm: number | null;
  rent_source: string | null;
  lease_years_remaining: number | null;
  pf_json: any;
  /** Lightweight EPC snapshot from the listing JSON — current/potential band and SAP score,
   *  without the improvement roadmap that only the government register provides. Present when
   *  the listing JSON carries EPC data; null otherwise. */
  epc_from_json: EpcFromJson | null;
  /** Sold comparables and area statistics from the listing JSON — for price benchmarking
   *  without a separate API call. Present when the JSON contains sold data; null otherwise. */
  market_data: MarketData | null;
}

export interface EpcFromJson {
  source: "pf_json";
  currentRating: string | null;
  currentScore: number | null;
  potentialRating: string | null;
  potentialScore: number | null;
  co2Current: number | null;
  co2Potential: number | null;
}

export interface SoldComparable {
  address: string | null;
  price: number | null;
  date: string | null;
  propertyType: string | null;
  beds: number | null;
  distanceMiles: number | null;
}

export interface MarketData {
  source: "pf_json";
  extractedAt: string;
  soldComparables: SoldComparable[];
  /** Median / average sold price stats for the immediate area, if the listing feed includes them. */
  areaStats: {
    medianSoldPrice?: number | null;
    averageSoldPrice?: number | null;
    sampleSize?: number | null;
    periodLabel?: string | null;
  } | null;
  /** The subject property's own last-sold record, lifted from propertyLight.lastSold. */
  subjectLastSold: { value: number; date: string } | null;
}

const TYPE_MAP: Record<string, string> = {
  HouseTerraced: "Terraced house",
  HouseSemi: "Semi-detached house",
  HouseDetached: "Detached house",
  FlatPurposeBuilt: "Flat",
  FlatConverted: "Flat (converted)",
  Bungalow: "Bungalow",
};

export function parsePropertyFilterJson(input: string | any): ParsedJsonProperty | null {
  let obj: any;
  try {
    obj = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    return null;
  }
  const light = obj?.propertyLight;
  const detail = obj?.propertyDetail;
  const listingFS = obj?.selectedList?.listingFS;
  if (!light?.address) return null;
  const postcodeMatch = light.address.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i);
  const imgs = collectImages(obj);
  const rent = light.rentEstimate ?? light.rentPcm ?? detail?.rent?.pcm ?? null;
  const leaseYrs = light.leaseYearsRemaining ?? detail?.leaseYearsRemaining ?? null;
  return {
    address: light.address,
    postcode: postcodeMatch ? postcodeMatch[0].toUpperCase() : null,
    beds: light.bedsCount ?? null,
    baths: light.bathroomsCount ?? null,
    property_type: TYPE_MAP[light.propertyType] ?? light.propertyType ?? null,
    epc_rate: light.epcRate || null,
    tenure: light.tenure ?? null,
    area_sqm: light.area ?? null,
    // The live "current price" (the asking price an investor negotiates against) lives at
    // different paths depending on the feed vintage — newer exports key the for-sale listing
    // under selectedList.listingFS.currentPriceValue rather than propertyDetail.forSale; without
    // this fallback the asking price (and everything downstream of it) silently comes through null.
    asking_price_gbp:
      listingFS?.currentPriceValue ??
      detail?.forSale?.currentPrice?.value ??
      detail?.forSale?.currentPrice ??
      null,
    image_urls: imgs,
    estimated_rent_pcm: rent ? Number(rent) : null,
    rent_source: rent ? "pf_json" : null,
    lease_years_remaining: leaseYrs ? Number(leaseYrs) : null,
    pf_json: obj,
    epc_from_json: extractEpcFromPfJson(light, detail),
    market_data: extractMarketDataFromPfJson(light, detail),
  };
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bandLetter(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return /^[A-G]$/.test(s) ? s : null;
}

/** Extracts EPC scores and bands from the listing JSON without requiring an EPC register call.
 *  Field paths tried (in order) for each value — add variants here if a feed uses different names:
 *    currentScore  : propertyDetail.epcEfficiency | epcCurrentScore | epcCurrentEfficiency | epcSapScore
 *    potentialScore: propertyDetail.epcPotential  | epcPotentialScore | epcPotentialEfficiency
 *    currentRating : propertyLight.epcRate | propertyDetail.epcCurrentBand | epcBand | epcRating
 *    potentialRating: propertyDetail.epcPotentialBand | epcPotentialRating
 */
export function extractEpcFromPfJson(light: any, detail: any): EpcFromJson | null {
  const currentScore = numOrNull(
    detail?.epcEfficiency ?? detail?.epcCurrentScore ?? detail?.epcCurrentEfficiency ?? detail?.epcSapScore,
  );
  const potentialScore = numOrNull(
    detail?.epcPotential ?? detail?.epcPotentialScore ?? detail?.epcPotentialEfficiency ?? detail?.epcPotentialSapScore,
  );
  const currentRating =
    bandLetter(light?.epcRate) ??
    bandLetter(detail?.epcCurrentBand) ??
    bandLetter(detail?.epcBand) ??
    bandLetter(detail?.epcRating) ??
    bandLetter(detail?.epcCurrentRating) ??
    null;
  const potentialRating =
    bandLetter(detail?.epcPotentialBand) ??
    bandLetter(detail?.epcPotentialRating) ??
    null;
  const co2Current = numOrNull(detail?.co2EmissionsCurrent ?? detail?.epcCo2Current ?? detail?.co2Current);
  const co2Potential = numOrNull(detail?.co2EmissionsPotential ?? detail?.epcCo2Potential ?? detail?.co2Potential);

  if (!currentRating && currentScore == null) return null;
  return { source: "pf_json", currentRating, currentScore, potentialRating, potentialScore, co2Current, co2Potential };
}

/** Extracts sold comparables and area stats from the listing JSON.
 *  Field paths tried for comparables array:
 *    propertyDetail.soldComparables | comparables | soldPrices | nearbyComparables | soldProperties
 *  Each entry is normalised to a common shape — add extra source fields in the mapping below
 *  if your feed uses different keys inside each comparable object.
 */
export function extractMarketDataFromPfJson(light: any, detail: any): MarketData | null {
  const rawComps: any[] =
    detail?.soldComparables ??
    detail?.comparables ??
    detail?.soldPrices ??
    detail?.nearbyComparables ??
    detail?.soldProperties ??
    [];

  const soldComparables: SoldComparable[] = (Array.isArray(rawComps) ? rawComps : [])
    .slice(0, 30)
    .map((c: any) => ({
      address: c.address ?? c.fullAddress ?? c.displayAddress ?? null,
      price: numOrNull(c.price ?? c.soldPrice ?? c.salePrice ?? c.value),
      date: c.date ?? c.soldDate ?? c.saleDate ?? null,
      propertyType: c.propertyType ?? c.type ?? null,
      beds: numOrNull(c.beds ?? c.bedsCount ?? c.bedrooms) ?? null,
      distanceMiles: numOrNull(c.distanceMiles ?? c.distance) ?? null,
    }))
    .filter((c: SoldComparable) => c.price != null);

  // Area statistics — median/average sold prices for the immediate area
  const rawArea = detail?.areaStats ?? detail?.marketData ?? detail?.localStats ?? detail?.priceStats ?? null;
  const areaStats = rawArea
    ? {
        medianSoldPrice: numOrNull(rawArea.medianSoldPrice ?? rawArea.median ?? rawArea.medianPrice),
        averageSoldPrice: numOrNull(rawArea.averageSoldPrice ?? rawArea.average ?? rawArea.avgPrice),
        sampleSize: numOrNull(rawArea.sampleSize ?? rawArea.count ?? rawArea.total),
        periodLabel: rawArea.period ?? rawArea.periodLabel ?? rawArea.label ?? null,
      }
    : null;

  const subjectLastSold =
    light?.lastSold?.value && light?.lastSold?.date
      ? { value: Number(light.lastSold.value), date: String(light.lastSold.date) }
      : null;

  if (!soldComparables.length && !areaStats && !subjectLastSold) return null;
  return {
    source: "pf_json",
    extractedAt: new Date().toISOString(),
    soldComparables,
    areaStats: areaStats ?? null,
    subjectLastSold,
  };
}

function collectImages(obj: any): string[] {
  const out = new Set<string>();
  const push = (v: any) => {
    if (!v) return;
    if (typeof v === "string" && /^https?:\/\//.test(v) && /\.(jpe?g|png|webp|gif)/i.test(v)) out.add(v);
    if (typeof v === "object" && typeof v.url === "string" && /^https?:\/\//.test(v.url)) out.add(v.url);
  };
  const walk = (node: any, depth: number) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (/image|photo|picture|media/i.test(k)) {
          if (typeof v === "string") push(v);
          else if (Array.isArray(v)) v.forEach(push);
          else if (v && typeof v === "object") walk(v, depth + 1);
        } else if (typeof v === "object") {
          walk(v, depth + 1);
        }
      }
    }
  };
  walk(obj, 0);
  return Array.from(out).slice(0, 30);
}