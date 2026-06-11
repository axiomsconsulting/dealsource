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

/** Maps an EPC recommendation title to the refurb-cost category vocabulary used in
 *  `refurb.ts`/`ai_payload`, so AI condition-scan findings (which use that vocabulary) can be
 *  matched against certificate recommendations. */
const MEASURE_CATEGORY_RULES: { re: RegExp; category: string }[] = [
  { re: /boiler|heating controls|heating system|hot water cylinder|thermostat/i, category: "boiler" },
  { re: /loft insulation|roof insulation/i, category: "roof" },
  { re: /cavity wall|solid wall|external wall|internal wall/i, category: "external" },
  { re: /floor insulation/i, category: "flooring" },
  { re: /window|glazing/i, category: "windows" },
  { re: /draught proofing/i, category: "external" },
];

export function categoriseEpcMeasure(title: string): string {
  for (const { re, category } of MEASURE_CATEGORY_RULES) if (re.test(title)) return category;
  return "epc_upgrade";
}

export interface EpcMeasureCandidate {
  index: number;
  title: string;
  category: string;
  costMin: number | null;
  costMax: number | null;
  resultingScore: number | null;
  resultingBand: string | null;
  crossesIntoC: boolean;
  aiRecommended: boolean;
  defaultSelected: boolean;
}

/** Builds a per-measure selection candidate list from the EPC roadmap. Each measure defaults
 *  to selected if it's part of the assessor's path to band C (current score < 69, on/before the
 *  step that crosses into C), or if the AI condition scan flagged a matching category. */
export function buildEpcMeasureCandidates(roadmap: EpcRoadmap, aiCategories: Set<string>): EpcMeasureCandidate[] {
  const neededForC = roadmap.currentScore == null || roadmap.currentScore < 69;
  let crossedIntoC = false;
  return roadmap.steps.map((s) => {
    const category = categoriseEpcMeasure(s.summary);
    const aiRecommended = aiCategories.has(category);
    const onPathToC = neededForC && !crossedIntoC;
    if (s.crossesIntoC) crossedIntoC = true;
    return {
      index: s.index,
      title: s.summary,
      category,
      costMin: s.costMin,
      costMax: s.costMax,
      resultingScore: s.resultingScore,
      resultingBand: s.resultingBand,
      crossesIntoC: s.crossesIntoC,
      aiRecommended,
      defaultSelected: onPathToC || aiRecommended,
    };
  });
}

/** Resolves the effective selection for each candidate (override wins, else default), and sums
 *  costs across the selected measures. */
export function resolveEpcMeasureSelection(
  candidates: EpcMeasureCandidate[],
  overrides: Record<number, boolean> | null | undefined,
): { selected: EpcMeasureCandidate[]; totals: { low: number; mid: number; high: number; count: number } } {
  const selected = candidates.filter((c) => overrides?.[c.index] ?? c.defaultSelected);
  let low = 0, mid = 0, high = 0;
  for (const c of selected) {
    const min = c.costMin ?? c.costMax ?? 0;
    const max = c.costMax ?? c.costMin ?? 0;
    low += min;
    high += max;
    mid += (min + max) / 2;
  }
  return { selected, totals: { low: Math.round(low), mid: Math.round(mid), high: Math.round(high), count: selected.length } };
}

/** Collects refurb categories the AI photo condition scan flagged (any from `refurb.items`,
 *  or `condition.items` with severity above "low"), for matching against EPC measures. */
export function deriveAiEpcCategories(aiPayload: any): Set<string> {
  const cats = new Set<string>();
  for (const it of aiPayload?.refurb?.items ?? []) {
    if (it?.category) cats.add(String(it.category).toLowerCase());
  }
  for (const it of aiPayload?.condition?.items ?? []) {
    if (it?.category && it?.severity !== "low") cats.add(String(it.category).toLowerCase());
  }
  return cats;
}

export { EPC_BANDS, bandForScore };
