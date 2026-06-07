import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtGBP } from "@/lib/format";
import { Link } from "@tanstack/react-router";

export interface ComparisonRow {
  id: string;
  address: string;
  postcode: string | null;
  asking: number | null;
  recommended: number | null;
  rent: number | null;
  grossYield: number | null;
  refurb: number | null;
  article4: string;
  sellerFlexPct: number | null;
  bestStrategy: string;
  score: number | null;
  riskSeverity: "none" | "amber" | "red";
  riskCount: number;
}

export function DealComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  if (!rows.length) return null;
  return (
    <Card className="mb-4 overflow-x-auto p-0">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Property</th>
            <th className="px-3 py-2 text-right">Asking</th>
            <th className="px-3 py-2 text-right">Rec. offer</th>
            <th className="px-3 py-2 text-right">Rent pcm</th>
            <th className="px-3 py-2 text-right">Gross yield</th>
            <th className="px-3 py-2 text-right">Refurb</th>
            <th className="px-3 py-2 text-center">Art. 4</th>
            <th className="px-3 py-2 text-right">Seller flex</th>
            <th className="px-3 py-2 text-left">Strategy</th>
            <th className="px-3 py-2 text-right">Risk</th>
            <th className="px-3 py-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">
                <Link to="/properties/$id" params={{ id: r.id }} className="font-medium hover:underline">
                  {r.address}
                </Link>
                {r.postcode && <div className="text-[10px] text-muted-foreground">{r.postcode}</div>}
              </td>
              <td className="px-3 py-2 text-right">{fmtGBP(r.asking)}</td>
              <td className="px-3 py-2 text-right font-medium text-primary">{fmtGBP(r.recommended)}</td>
              <td className="px-3 py-2 text-right">{r.rent ? fmtGBP(r.rent) : "—"}</td>
              <td className="px-3 py-2 text-right">{r.grossYield != null ? `${r.grossYield.toFixed(2)}%` : "—"}</td>
              <td className="px-3 py-2 text-right">{fmtGBP(r.refurb)}</td>
              <td className="px-3 py-2 text-center">
                {r.article4 === "inside" ? <Badge variant="outline" className="border-amber-400 text-amber-800">In</Badge>
                  : r.article4 === "partial" ? <Badge variant="outline" className="border-amber-300 text-amber-700">Part</Badge>
                  : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {r.sellerFlexPct != null && r.sellerFlexPct !== 0
                  ? <span className={r.sellerFlexPct > 0 ? "text-primary" : "text-destructive"}>{r.sellerFlexPct > 0 ? "+" : ""}{(r.sellerFlexPct * 100).toFixed(1)}%</span>
                  : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2">{r.bestStrategy || "—"}</td>
              <td className="px-3 py-2 text-right">
                {r.riskCount === 0 ? <span className="text-muted-foreground">clean</span>
                  : <Badge variant={r.riskSeverity === "red" ? "destructive" : "outline"} className={r.riskSeverity === "amber" ? "border-amber-400 text-amber-900" : ""}>{r.riskCount}</Badge>}
              </td>
              <td className="px-3 py-2 text-right">
                <span className={`font-bold ${(r.score ?? 0) >= 60 ? "text-primary" : (r.score ?? 0) >= 40 ? "text-amber-600" : "text-muted-foreground"}`}>{r.score ?? "—"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}