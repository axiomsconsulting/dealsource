import { EPC_BANDS, bandForScore } from "@/lib/epc.functions";

export interface EpcRoadmapStep {
  index: number;
  id: string | number | null;
  summary: string;
  description: string | null;
  costMin: number | null;
  costMax: number | null;
  costLabel: string;
  cumulativeMin: number;
  cumulativeMax: number;
  /** True once this step's cumulative spend is the first to plausibly clear the D (≥55) threshold,
   *  going purely on the register's overall current→potential point gain spread proportionally
   *  across the (cost-ordered) measures — a steer, not a certified outcome. */
  crossesIntoD: boolean;
  crossesIntoC: boolean;
}

export interface EpcRoadmap {
  pointsToD: number | null;
  pointsToC: number | null;
  totalAvailablePoints: number | null;
  steps: EpcRoadmapStep[];
  totalCostMin: number;
  totalCostMax: number;
}

/** Builds a minimum-spend-first roadmap from the register's recommendations (already cost-sorted
 *  ascending by `fetchEpcForProperty`). The EPC register doesn't publish a per-measure point
 *  contribution, so the "reaches D / reaches C" markers are an even-spread estimate across the
 *  measures that actually carry a costed figure — clearly framed as a steer for sequencing, not a
 *  guarantee of the resulting band. The bands and totals it anchors to (current/potential score and
 *  the overall spend to realise the register's stated potential) ARE the register's own figures. */
export function buildEpcRoadmap(epc: {
  currentScore: number | null;
  potentialScore: number | null;
  recommendations: Array<{ id: string | number | null; summary: string; description: string | null; costMin: number | null; costMax: number | null; costLabel: string }>;
}): EpcRoadmap | null {
  const { currentScore, potentialScore, recommendations } = epc;
  if (!recommendations?.length) return null;

  const pointsToD = currentScore != null ? Math.max(0, 55 - currentScore) : null;
  const pointsToC = currentScore != null ? Math.max(0, 69 - currentScore) : null;
  const totalAvailablePoints = currentScore != null && potentialScore != null ? Math.max(0, potentialScore - currentScore) : null;

  const costed = recommendations.filter((r) => r.costMin != null);
  const pointShare = costed.length ? (totalAvailablePoints ?? 0) / costed.length : 0;

  let cumMin = 0, cumMax = 0, cumPoints = 0, costedSeen = 0;
  let dMarked = false, cMarked = false;
  const steps: EpcRoadmapStep[] = recommendations.map((r, i) => {
    cumMin += r.costMin ?? 0;
    cumMax += r.costMax ?? r.costMin ?? 0;
    if (r.costMin != null) { costedSeen++; cumPoints += pointShare; }

    let crossesIntoD = false, crossesIntoC = false;
    if (totalAvailablePoints != null) {
      if (!dMarked && pointsToD != null && pointsToD > 0 && cumPoints >= pointsToD) { crossesIntoD = true; dMarked = true; }
      if (!cMarked && pointsToC != null && pointsToC > 0 && cumPoints >= pointsToC) { crossesIntoC = true; cMarked = true; }
    }
    return {
      index: i + 1,
      id: r.id,
      summary: r.summary,
      description: r.description,
      costMin: r.costMin,
      costMax: r.costMax,
      costLabel: r.costLabel,
      cumulativeMin: cumMin,
      cumulativeMax: cumMax,
      crossesIntoD,
      crossesIntoC,
    };
  });

  return {
    pointsToD,
    pointsToC,
    totalAvailablePoints,
    steps,
    totalCostMin: cumMin,
    totalCostMax: cumMax,
  };
}

export { EPC_BANDS, bandForScore };
