import type { PropertyInput } from "./types";

export interface PriceHistoryEntry {
  value: number;
  date: string;
  /** £ change versus the next-older entry — positive means the price went up. */
  changeFromPrevious?: number;
}

/** Normalises Property Filter's `propertyDetail.pricesHisto` (newest listing-price changes,
 *  unsorted in the source feed) into a newest-first £/date timeline so the negotiation evidence
 *  and UI read from one consistent shape instead of each re-parsing the raw blob. */
export function extractPriceHistory(prop: PropertyInput): PriceHistoryEntry[] {
  const raw = (prop as any)?.pf_json?.propertyDetail?.pricesHisto;
  if (!Array.isArray(raw) || raw.length < 1) return [];
  const entries = raw
    .filter((r: any) => typeof r?.value === "number" && r.value > 0 && r?.date)
    .map((r: any) => ({ value: Number(r.value), date: String(r.date) }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return entries.map((e, i) => ({
    ...e,
    changeFromPrevious: i < entries.length - 1 ? Math.round(e.value - entries[i + 1].value) : undefined,
  }));
}

export function fmtHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One-line, evidence-grade summary of the tracked listing-price trajectory — e.g. "From £260,000
 *  (10 Oct 2025) to £220,000 now — down £40,000 (15.4%) across 5 recorded change(s)." Used to make
 *  the "price reduced" negotiation point concrete (dates and pounds) rather than just a count. */
export function summarisePriceHistory(history: PriceHistoryEntry[]): string | null {
  if (history.length < 2) return null;
  const newest = history[0];
  const oldest = history[history.length - 1];
  const totalChange = newest.value - oldest.value;
  if (totalChange >= 0) return null;
  const drop = Math.abs(totalChange);
  const pct = oldest.value > 0 ? (drop / oldest.value) * 100 : 0;
  return `From £${oldest.value.toLocaleString()} (${fmtHistoryDate(oldest.date)}) to £${newest.value.toLocaleString()} now — down £${drop.toLocaleString()} (${pct.toFixed(1)}%) across ${history.length - 1} recorded change${history.length - 1 === 1 ? "" : "s"}.`;
}
