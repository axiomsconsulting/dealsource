import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

/** A Card that can be collapsed to a single-line summary — lets a long page of cards be scanned
 *  at a glance, then expanded one at a time for detail. Follows the same useState + chevron toggle
 *  pattern as ImageLibrary's "Expand library" control rather than introducing Radix Accordion.
 *  Mirrors the existing deal-sheet card shape (h2 inside CardContent, no CardHeader) so collapsing
 *  doesn't change the look of any card versus how it renders today. */
export function CollapsibleCard({
  icon, title, summary, defaultOpen = true, className, children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** One-line condensed description shown next to the title while collapsed. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold">
            {icon}
            <span className="truncate">{title}</span>
          </h2>
          <span className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-normal text-muted-foreground">
            {!open && summary && <span className="hidden truncate sm:inline">{summary}</span>}
            {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </span>
        </button>
        {open && <div className="mt-4">{children}</div>}
      </CardContent>
    </Card>
  );
}
