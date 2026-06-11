import { Badge } from "@/components/ui/badge";
import { fmtGBP } from "@/lib/format";

export function SpecOptionsRow({
  options,
  highlight,
}: {
  options: { rating: "L" | "M" | "H"; label: string; gbp: number }[];
  highlight?: "L" | "M" | "H";
}) {
  if (!options || options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((s) => (
        <div
          key={s.rating}
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
            s.rating === highlight
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "bg-muted/30"
          }`}
        >
          <Badge className="h-5 w-5 justify-center rounded-full p-0 text-[10px]">{s.rating}</Badge>
          <span className="text-muted-foreground">{s.label}</span>
          <span className="font-semibold">{fmtGBP(s.gbp)}</span>
        </div>
      ))}
    </div>
  );
}
