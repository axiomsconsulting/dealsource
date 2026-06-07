// Listings rarely tag floor plans explicitly — they just show up in the same image array/library as
// photos. Spot them by filename/caption convention so hero galleries and floor plans can be sized and
// laid out appropriately instead of being cropped into a uniform photo grid.
const FLOOR_PLAN_RE = /floor[\s_-]?plan|floorplan|site[\s_-]?plan|layout[\s_-]?plan/i;

export function isFloorPlan(...candidates: (string | null | undefined)[]): boolean {
  return candidates.some((c) => !!c && FLOOR_PLAN_RE.test(c));
}

export function partitionImageUrls(urls: string[]): { photos: string[]; floorPlans: string[] } {
  const photos: string[] = [];
  const floorPlans: string[] = [];
  for (const u of urls) (isFloorPlan(u) ? floorPlans : photos).push(u);
  return { photos, floorPlans };
}
