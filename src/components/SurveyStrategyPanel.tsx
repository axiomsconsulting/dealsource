import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { HardHat, Search } from "lucide-react";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { buildSurveyStrategy, type SurveyIssueKey } from "@/lib/analysis/survey-strategy";
import type { SurveyFindings, SurveySeverity } from "@/lib/analysis/types";
import { updateProperty } from "@/lib/ingest.functions";
import { fmtGBP } from "@/lib/format";

const SIGNAL_BADGE: Record<string, string> = {
  flagged: "bg-amber-500 text-white",
  watch: "border-sky-300 bg-sky-50 text-sky-700",
  routine: "text-muted-foreground",
};
const SIGNAL_LABEL: Record<string, string> = {
  flagged: "Flagged from the data",
  watch: "Worth watching",
  routine: "Check on every purchase",
};

const SHORT_LABEL: Record<SurveyIssueKey, string> = {
  non_standard_construction: "Non-standard",
  structural: "Structural",
  roof: "Roof",
  asbestos: "Asbestos",
  damp: "Damp",
  timber_decay: "Timber",
  windows_joinery: "Windows",
  drainage_rainwater: "Drainage",
  electrics_plumbing: "Electrical",
  insulation_energy: "Insulation",
  japanese_knotweed: "Knotweed",
  external_grounds: "External",
};

const SEVERITY_RATIO: Record<SurveySeverity, number> = { low: 0, medium: 0.5, high: 1 };

/** Survey/condition leverage: what to brief the Level 3 surveyor and builder to dig into and
 *  report on, what a confirmed finding is realistically worth off the price, and — once the
 *  surveyor reports back — a checkbox + severity (low/medium/high) to confirm each finding.
 *  Confirmed findings are persisted to `property.survey_findings`, flow straight into the
 *  negotiation playbook's offer plan as high-confidence "fault" leverage (see
 *  `buildSurveyNegotiationPoints` / `buildNegotiation`), and surface verbatim in the talking
 *  points script as survey results. */
export function SurveyStrategyPanel({
  property,
  onLiveChange,
}: {
  property: any;
  onLiveChange?: (findings: SurveyFindings) => void;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateProperty);
  const issues = buildSurveyStrategy(property);
  const asking = Number(property.asking_price_gbp ?? 0);

  const [local, setLocal] = useState<SurveyFindings>((property.survey_findings as any) ?? {});

  const saveMut = useMutation({
    mutationFn: (patch: SurveyFindings) =>
      update({ data: { id: property.id, patch: { survey_findings: patch as any } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property", property.id] }),
  });

  const toggle = (key: string, active: boolean) => {
    const next: SurveyFindings = {
      ...local,
      [key]: { ...(local[key] ?? { severity: "medium" as SurveySeverity }), active },
    };
    setLocal(next);
    onLiveChange?.(next);
    saveMut.mutate(next);
  };
  const setSeverity = (key: string, severity: SurveySeverity) => {
    const next: SurveyFindings = {
      ...local,
      [key]: { ...(local[key] ?? { active: true }), active: true, severity },
    };
    setLocal(next);
    onLiveChange?.(next);
    saveMut.mutate(next);
  };
  const setNote = (key: string, note: string) => {
    setLocal((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { active: false, severity: "medium" as SurveySeverity }), note },
    }));
  };
  const saveNote = () => {
    onLiveChange?.(local);
    saveMut.mutate(local);
  };

  const totalLeverage = issues.reduce((sum, issue) => {
    const f = local[issue.key];
    if (!f?.active || asking <= 0) return sum;
    const ratio = SEVERITY_RATIO[f.severity] ?? 0.5;
    const pct = issue.markdownLowPct + (issue.markdownHighPct - issue.markdownLowPct) * ratio;
    return sum + Math.round(asking * pct);
  }, 0);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        What to brief your Level 3 (RICS Building Survey) surveyor and builder to specifically dig
        into and report on. Once the survey is back, tick anything confirmed and set its severity —
        confirmed findings are added as further reduction to the offer plan and to the talking
        points as survey results.
      </p>
      {issues.map((issue) => {
        const f = local[issue.key];
        const active = !!f?.active;
        const severity = f?.severity ?? "medium";
        const ratio = SEVERITY_RATIO[severity];
        const confirmedGbp =
          asking > 0
            ? Math.round(
                asking *
                  (issue.markdownLowPct + (issue.markdownHighPct - issue.markdownLowPct) * ratio),
              )
            : 0;

        const potentialGbp = asking > 0 ? Math.round(asking * issue.markdownLowPct) : 0;
        const displayGbp = active ? confirmedGbp : potentialGbp;

        return (
          <CollapsibleCard
            key={issue.key}
            variant="plain"
            defaultOpen={false}
            title={SHORT_LABEL[issue.key]}
            summary={SIGNAL_LABEL[issue.signal]}
            className={active ? "border-primary bg-primary/5" : ""}
            actions={
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={active}
                  onCheckedChange={(b) => toggle(issue.key, !!b)}
                  title="Confirmed by survey"
                />
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={severity}
                  onValueChange={(v) => v && setSeverity(issue.key, v as SurveySeverity)}
                >
                  {(["low", "medium", "high"] as SurveySeverity[]).map((s) => (
                    <ToggleGroupItem
                      key={s}
                      value={s}
                      className="h-9 px-2.5 text-xs sm:h-6 sm:px-2 sm:text-[10px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      {s[0].toUpperCase()}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {displayGbp > 0 && (
                  <span
                    className={`text-sm font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}
                  >
                    −{fmtGBP(displayGbp)}
                  </span>
                )}
              </div>
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{issue.title}</p>
              <Badge className={`text-[10px] ${SIGNAL_BADGE[issue.signal]}`}>
                {SIGNAL_LABEL[issue.signal]}
              </Badge>
            </div>
            {issue.evidence && (
              <p className="mt-1.5 text-xs text-muted-foreground">{issue.evidence}</p>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-muted/30 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                  <Search className="h-3.5 w-3.5 text-sky-600" /> Brief the surveyor
                </p>
                <p className="text-xs text-muted-foreground">{issue.surveyorBrief}</p>
              </div>
              <div className="rounded-md bg-muted/30 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                  <HardHat className="h-3.5 w-3.5 text-orange-500" /> Brief the builder
                </p>
                <p className="text-xs text-muted-foreground">{issue.builderBrief}</p>
              </div>
            </div>

            <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">If confirmed — markdown to negotiate</span>
                {asking > 0 && (
                  <span className="font-bold">
                    {fmtGBP(Math.round(asking * issue.markdownLowPct))} –{" "}
                    {fmtGBP(Math.round(asking * issue.markdownHighPct))}
                    <span className="ml-1 font-normal text-amber-800">
                      ({Math.round(issue.markdownLowPct * 100)}–
                      {Math.round(issue.markdownHighPct * 100)}% of asking)
                    </span>
                  </span>
                )}
              </div>
              <p className="mt-1">{issue.markdownNote}</p>
            </div>

            {active && (
              <div className="mt-2.5 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Confirmed by survey
                  </p>
                  {asking > 0 && (
                    <span className="text-sm font-bold text-primary">
                      −{fmtGBP(confirmedGbp)} applied to offer plan
                    </span>
                  )}
                </div>
                <Input
                  placeholder="Optional note from the survey report (quoted in talking points)"
                  value={f?.note ?? ""}
                  onChange={(e) => setNote(issue.key, e.target.value)}
                  onBlur={saveNote}
                  className="h-7 text-xs"
                />
              </div>
            )}
          </CollapsibleCard>
        );
      })}

      {totalLeverage > 0 && (
        <div className="flex items-center justify-between rounded-md border border-primary bg-primary/5 p-3">
          <p className="text-sm font-medium">Survey-confirmed leverage applied to the deal</p>
          <p className="text-lg font-bold text-primary">−{fmtGBP(totalLeverage)}</p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        These are starting briefs and indicative ranges to anchor the conversation. Tick a finding
        and set its severity once your surveyor confirms it — this feeds directly into the offer
        plan above and into the talking points as survey results; the actual figure should always be
        reconciled against your surveyor's and builder's specific findings and quotes before you put
        a number to the agent.
      </p>
    </div>
  );
}
