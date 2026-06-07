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
    pf_json: obj,
  };
}