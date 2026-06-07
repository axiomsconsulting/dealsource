import Papa from "papaparse";

export interface ParsedCsvRow {
  address: string;
  postcode: string | null;
  city: string | null;
  beds: number | null;
  property_type: string | null;
  epc_rate: string | null;
  tenure: string | null;
  area_sqm: number | null;
  asking_price_gbp: number | null;
  agent_name: string | null;
  source_link: string | null;
  csv_row: Record<string, any>;
}

function extractHyperlinkUrl(cell: string | undefined): string | null {
  if (!cell) return null;
  const m = cell.match(/HYPERLINK\("([^"]+)"/);
  return m ? m[1] : (cell.startsWith("http") ? cell : null);
}

export function parsePropertyFilterCsv(text: string): ParsedCsvRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data
    .filter((r) => r["Full Address"] || r["Address1"] || r["Address2"])
    .map((r) => {
      const addr = (r["Full Address"] || [r["Address1"], r["Address2"], r["Address3"], r["City"]].filter(Boolean).join(", ")).trim();
      const beds = r["BedsCount"] ? parseInt(r["BedsCount"]) : null;
      const area = r["Area (m²)"] || r["Area (m\u00b2)"] || r["Area"] || "";
      const price = r["ForSale Current Price Value"];
      return {
        address: addr,
        postcode: r["Postcode"] || null,
        city: r["City"] || null,
        beds: Number.isFinite(beds as number) ? beds : null,
        property_type: r["PropertyType"] || null,
        epc_rate: r["EPC Rate"] || null,
        tenure: r["Tenure"] || null,
        area_sqm: area ? parseFloat(area) : null,
        asking_price_gbp: price ? parseFloat(price) : null,
        agent_name: r["Agent_00_Name"] || null,
        source_link: extractHyperlinkUrl(r["Link"]),
        csv_row: r,
      };
    });
}