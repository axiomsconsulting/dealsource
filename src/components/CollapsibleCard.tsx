import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

/** A Card (or, with `variant="plain"`, a plain bordered box for nesting inside another card) that
 *  can be collapsed to a single-line summary — lets a long page of cards be scanned at a glance,
 *  then expanded one at a time for detail. Follows the same useState + chevron toggle pattern as
 *  ImageLibrary's "Expand library" control rather than introducing Radix Accordion.
 *  State is uncontrolled (`defaultOpen`) by default; pass `open`/`onOpenChange` to let a parent
 *  drive it (e.g. for "expand all" controls or jump-to-section links). */
export function CollapsibleCard({
  icon,
  title,
  summary,
  actions,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  variant = "card",
  id,
  className,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** One-line condensed description shown next to the title while collapsed. */
  summary?: ReactNode;
  /** Always-visible controls in the header row (collapsed or not), e.g. an action button. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state — when provided, this component no longer manages its own state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "plain" renders a bordered div instead of a Card, for nesting inside another card. */
  variant?: "card" | "plain";
  /** HTML id on the outer element, for anchor/jump-link scrolling. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setOpenState(v);
  };

  const header = (
    <div className="flex w-full items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <h2
          className={
            variant === "plain"
              ? "flex min-w-0 items-center gap-2 text-sm font-medium"
              : "flex min-w-0 items-center gap-2 text-xl font-semibold"
          }
        >
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        {!open && summary && (
          <span className="hidden min-w-0 truncate text-sm font-normal text-muted-foreground sm:inline">
            {summary}
          </span>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Collapse" : "Expand"}
          className="text-muted-foreground hover:text-foreground"
        >
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </button>
      </div>
    </div>
  );

  if (variant === "plain") {
    return (
      <div
        id={id}
        className={className ? `rounded-md border p-2.5 ${className}` : "rounded-md border p-2.5"}
      >
        {header}
        {open && <div className="mt-2">{children}</div>}
      </div>
    );
  }

  return (
    <Card id={id} className={className}>
      <CardContent className="pt-4">
        {header}
        {open && <div className="mt-3">{children}</div>}
      </CardContent>
    </Card>
  );
}
