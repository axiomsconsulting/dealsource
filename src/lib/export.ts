import { fmtGBP } from "./format";

export interface ExportRow {
  address: string;
  postcode: string;
  asking_price: number | null;
  recommended_offer: number | null;
  max_offer: number | null;
  est_rent_pcm: number | null;
  gross_yield_pct: number | null;
  yield_on_cash_in_pct: number | null;
  refurb_total: number | null;
  article4_status: string;
  seller_flex_pct: number | null;
  best_strategy: string;
  deal_score: number | null;
  risk_severity: string;
  risk_flags: string;
}

const HEADERS: Record<keyof ExportRow, string> = {
  address: "Address",
  postcode: "Postcode",
  asking_price: "Asking price (£)",
  recommended_offer: "Recommended offer (£)",
  max_offer: "Max offer (£)",
  est_rent_pcm: "Est rent (£/pcm)",
  gross_yield_pct: "Gross yield (%)",
  yield_on_cash_in_pct: "Yield on cash in (%)",
  refurb_total: "Refurb total (£)",
  article4_status: "Article 4",
  seller_flex_pct: "Seller flex (%)",
  best_strategy: "Best strategy",
  deal_score: "Deal score",
  risk_severity: "Risk severity",
  risk_flags: "Risk flags",
};

function escape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCSV(rows: ExportRow[]): string {
  const keys = Object.keys(HEADERS) as (keyof ExportRow)[];
  const header = keys.map((k) => escape(HEADERS[k])).join(",");
  const body = rows.map((r) => keys.map((k) => escape(r[k])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { fmtGBP };