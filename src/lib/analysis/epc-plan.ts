import { EPC_BANDS, bandForScore } from "@/lib/epc.functions";

export interface EpcRoadmapStep {
  index: number;
  sequence: number | null;
  summary: string;
  costMin: number | null;
  costMax: number | null;
  costLabel: string;
  cumulativeMin: number;
  cumulativeMax: number;
  typicalSavingPerYear: number | null;
  /** The register's own calculated cumulative score after completing every step up to and
   *  including this one — not an estimate. */
  resultingScore: number | null;
  resultingBand: string | null;
  /** True the first time the register's own cumulative figure for this step reaches band D / C. */
  crossesIntoD: boolean;
  crossesIntoC: boolean;
}

export interface EpcRoadmap {
  currentScore: number | null;
  potentialScore: number | null;
  steps: EpcRoadmapStep[];
  totalCostMin: number;
  totalCostMax: number;
}

/** Builds the cheapest-first improvement roadmap straight from the register's own assessor
 *  sequence. Unlike the old EPC register API — which published no per-measure score contribution,
 *  forcing an estimated "even spread" of points across costed measures — the new register returns
 *  `energy_performance_rating` on every suggested improvement: the REAL, government-calculated
 *  cumulative score after completing steps 1..N in order. So "where does this plausibly cross into
 *  D / C" is no longer a guess; it's read directly off the register's own figures. */
export function buildEpcRoadmap(epc: {
  currentScore: number | null;
  potentialScore: number | null;
  recommendations: Array<{
    sequence: number | null; title: string;
    costMin: number | null; costMax: number | null; costLabel: string;
    typicalSavingPerYear: number | null;
    cumulativeCostMin: number; cumulativeCostMax: number;
    resultingScore: number | null; resultingBand: string | null;
  }>;
}): EpcRoadmap | null {
  const { currentScore, potentialScore, recommendations } = epc;
  if (!recommendations?.length) return null;

  let dMarked = currentScore != null && currentScore >= 55;
  let cMarked = currentScore != null && currentScore >= 69;
  let cumMin = 0, cumMax = 0;

  const steps: EpcRoadmapStep[] = recommendations.map((r, i) => {
    cumMin = r.cumulativeCostMin;
    cumMax = r.cumulativeCostMax;

    let crossesIntoD = false, crossesIntoC = false;
    if (!dMarked && r.resultingScore != null && r.resultingScore >= 55) { crossesIntoD = true; dMarked = true; }
    if (!cMarked && r.resultingScore != null && r.resultingScore >= 69) { crossesIntoC = true; cMarked = true; }

    return {
      index: i + 1,
      sequence: r.sequence,
      summary: r.title,
      costMin: r.costMin,
      costMax: r.costMax,
      costLabel: r.costLabel,
      cumulativeMin: cumMin,
      cumulativeMax: cumMax,
      typicalSavingPerYear: r.typicalSavingPerYear,
      resultingScore: r.resultingScore,
      resultingBand: r.resultingBand,
      crossesIntoD,
      crossesIntoC,
    };
  });

  return {
    currentScore,
    potentialScore,
    steps,
    totalCostMin: cumMin,
    totalCostMax: cumMax,
  };
}

export { EPC_BANDS, bandForScore };
