import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CHANGELOG, type ChangelogEntryType } from "@/lib/changelog";

export const Route = createFileRoute("/_authenticated/about")({
  head: () => ({ meta: [{ title: "About — Deal Negotiator" }] }),
  component: AboutPage,
});

const BADGE: Record<ChangelogEntryType, string> = {
  major: "bg-primary text-primary-foreground",
  minor: "bg-blue-500 text-white",
  patch: "bg-muted text-muted-foreground",
};

function AboutPage() {
  const current = CHANGELOG[0];
  return (
    <AppShell title="About">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deal Negotiator</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Current version{" "}
              <span className="font-semibold text-foreground">{current.version}</span>, released{" "}
              {new Date(current.date).toLocaleDateString()}.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {CHANGELOG.map((entry) => (
            <Card key={entry.version}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{entry.title}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={BADGE[entry.type]}>{entry.version}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {entry.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
