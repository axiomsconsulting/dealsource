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
    asking_price_gbp:
      detail?.forSale?.currentPrice?.value ??
      detail?.forSale?.currentPrice ??
      null,
    image_urls: imgs,
    estimated_rent_pcm: rent ? Number(rent) : null,
    rent_source: rent ? "pf_json" : null,
    lease_years_remaining: leaseYrs ? Number(leaseYrs) : null,
    pf_json: obj,
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