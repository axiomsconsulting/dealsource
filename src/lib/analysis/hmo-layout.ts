// Statutory minimum bedroom floor areas for licensed HMOs in England — The Licensing and
// Management of Houses in Multiple Occupation (Additional Provisions) (England) Regulations 2007,
// given effect via mandatory licence conditions on room sizes for sleeping accommodation:
//   - one person aged 10 or over: 6.51 m²
//   - two persons sharing: 10.22 m²
//   - one person under 10: 4.64 m²
// Single-let bedrooms are the standard basis for room-rate HMO income, so every converted room is
// sized to the single-occupant minimum; the double-occupancy figure is exposed for reference.
export const HMO_MIN_SINGLE_ROOM_SQM = 6.51;
export const HMO_MIN_DOUBLE_ROOM_SQM = 10.22;
export const HMO_MIN_CHILD_ROOM_SQM = 4.64;

// Kitchen, bathroom(s)/WCs, hallways and any communal living space all eat into total floor area
// without being lettable — this is a conservative rule-of-thumb reserve, not a regulatory figure
// (actual amenity standards are set per local authority and vary with occupancy count).
const COMMUNAL_RESERVE_PCT = 0.30;

// Per-ensuite UK conversion cost by spec tier (shower/WC pod, basin, tiling, extraction, drainage
// run to nearest stack) — Low = budget shower-pod, Medium = standard ensuite, High = premium fit-out.
export const ENSUITE_CONVERSION_COST_GBP: Record<"L" | "M" | "H", number> = {
  L: 3000,
  M: 5500,
  H: 8500,
};
// Achievable rent uplift per ensuite room vs. a room sharing a bathroom.
export const ENSUITE_RENT_PREMIUM_PCM = 75;
// Cost to convert a room/loft/annexe into a fully self-contained unit (own ensuite + kitchenette) for SA.
export const SA_SELF_CONTAINED_UNIT_COST_GBP: Record<"L" | "M" | "H", number> = {
  L: 8000,
  M: 14000,
  H: 22000,
};
export const SPEC_LABELS: Record<"L" | "M" | "H", string> = {
  L: "Low spec",
  M: "Medium spec",
  H: "High spec",
};

export interface HmoAreaEstimate {
  totalAreaSqm: number;
  lettableAreaSqm: number;
  maxRooms: number;
  minRoomSqm: number;
  communalReservePct: number;
}

/** A floor-area-only ceiling on lettable HMO bedrooms, grounded in the statutory minimum bedroom
 *  size — arithmetic against a published standard, not a guess at how a specific layout could be
 *  carved up. Returns null when no floor area is on file (the only case where we genuinely don't
 *  know enough to say anything). */
export function estimateMaxHmoRoomsByArea(areaSqm: number | null | undefined): HmoAreaEstimate | null {
  if (!areaSqm || areaSqm <= 0) return null;
  const lettableAreaSqm = areaSqm * (1 - COMMUNAL_RESERVE_PCT);
  const maxRooms = Math.max(0, Math.floor(lettableAreaSqm / HMO_MIN_SINGLE_ROOM_SQM));
  return {
    totalAreaSqm: areaSqm,
    lettableAreaSqm: Math.round(lettableAreaSqm * 10) / 10,
    maxRooms,
    minRoomSqm: HMO_MIN_SINGLE_ROOM_SQM,
    communalReservePct: COMMUNAL_RESERVE_PCT,
  };
}
