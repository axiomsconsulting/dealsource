import { Badge } from "@/components/ui/badge";
import { fmtGBP } from "@/lib/format";
import { extractMarketDataFromPfJson, type MarketData, type SoldComparable } from "@/lib/parsers/json";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function priceVsAsking(soldPrice: number, askingPrice: number): { label: string; cls: string } {
  const diff = ((soldPrice - askingPrice) / askingPrice) * 100;
  if (Math.abs(diff) < 0.5) return { label: "≈ asking", cls: "text-muted-foreground" };
  if (diff < 0) return { label: `${Math.abs(diff).toFixed(1)}% below asking`, cls: "text-emerald-700" };
  return { label: `${diff.toFixed(1)}% above asking`, cls: "text-amber-700" };
}

interface Props {
  pf_json: any;
  askingPrice: number | null;
}

export function MarketComparablesPanel({ pf_json, askingPrice }: Props) {
  const marketData: MarketData | null = extractMarketDataFromPfJson(
    pf_json?.propertyLight ?? {},
    pf_json?.propertyDetail ?? {},
  );
  if (!marketData) return null;

  const { soldComparables, areaStats, subjectLastSold } = marketData;
  const hasComps = soldComparables.length > 0;
  const hasStats = areaStats && (areaStats.medianSoldPrice || areaStats.averageSoldPrice);

  if (!hasComps && !hasStats && !subjectLastSold) return null;

  const prices = soldComparables.map((c) => c.price).filter((p): p is number => p != null);
  const medianComp =
    prices.length > 0
      ? prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)]
      : null;

  return (
    <div className="space-y-4">
        {/* Headline benchmark boxes */}
        {(askingPrice || medianComp || hasStats) && (
          <div className="grid gap-3 sm:grid-cols-3">
            {askingPrice && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Asking price</p>
                <p className="mt-0.5 text-base font-semibold">{fmtGBP(askingPrice)}</p>
              </div>
            )}
            {medianComp && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Median of {prices.length} sold comp{prices.length === 1 ? "" : "s"}
                </p>
                <p className="mt-0.5 text-base font-semibold">{fmtGBP(medianComp)}</p>
                {askingPrice && (
                  <p className={`mt-0.5 text-xs ${priceVsAsking(medianComp, askingPrice).cls}`}>
                    {priceVsAsking(medianComp, askingPrice).label}
                  </p>
                )}
              </div>
            )}
            {hasStats && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Area {areaStats!.medianSoldPrice ? "median" : "average"}
                  {areaStats!.periodLabel ? ` · ${areaStats!.periodLabel}` : ""}
                  {areaStats!.sampleSize ? ` (${areaStats!.sampleSize} sales)` : ""}
                </p>
                <p className="mt-0.5 text-base font-semibold">
                  {fmtGBP((areaStats!.medianSoldPrice ?? areaStats!.averageSoldPrice)!)}
                </p>
                {askingPrice && (
                  <p className={`mt-0.5 text-xs ${priceVsAsking((areaStats!.medianSoldPrice ?? areaStats!.averageSoldPrice)!, askingPrice).cls}`}>
                    {priceVsAsking((areaStats!.medianSoldPrice ?? areaStats!.averageSoldPrice)!, askingPrice).label}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Subject last sold */}
        {subjectLastSold && (
          <p className="text-sm text-muted-foreground">
            This property last sold for{" "}
            <span className="font-medium text-foreground">{fmtGBP(subjectLastSold.value)}</span>{" "}
            in {fmtDate(subjectLastSold.date)}
            {askingPrice && subjectLastSold.value > 0
              ? ` — asking is ${fmtGBP(Math.abs(askingPrice - subjectLastSold.value))} ${askingPrice > subjectLastSold.value ? "above" : "below"} that.`
              : "."}
          </p>
        )}

        {/* Comparables table */}
        {hasComps && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sold comparables from listing data
            </p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Address</th>
                    <th className="px-3 py-2 font-medium text-right">Price</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium text-right">vs asking</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {soldComparables.map((c: SoldComparable, i: number) => {
                    const vs = c.price && askingPrice ? priceVsAsking(c.price, askingPrice) : null;
                    return (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-xs">
                          {c.address ?? "—"}
                          {c.distanceMiles != null && (
                            <span className="ml-1 text-muted-foreground">
                              ({c.distanceMiles.toFixed(2)} mi)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {c.price ? fmtGBP(c.price) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.date)}</td>
                        <td className="px-3 py-2">
                          {c.propertyType ? (
                            <Badge variant="outline" className="text-[10px]">
                              {c.propertyType}
                            </Badge>
                          ) : (
                            "—"
                          )}
                          {c.beds != null && (
                            <span className="ml-1 text-xs text-muted-foreground">{c.beds}b</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {vs ? <span className={vs.cls}>{vs.label}</span> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Sourced from listing JSON — compare by property type and bed count for reliable benchmarking.
            </p>
          </div>
        )}
    </div>
  );
}
