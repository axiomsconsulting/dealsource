import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type CSSProperties } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "@/components/AdminTabs";
import {
  listThemes, createTheme, updateTheme, setActiveTheme, deleteTheme,
} from "@/lib/theme.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/theming")({
  head: () => ({ meta: [{ title: "Admin — Theming" }] }),
  component: AdminThemingPage,
});

const COLOR_VARS: { key: string; label: string }[] = [
  { key: "--background", label: "Page background" },
  { key: "--foreground", label: "Page text" },
  { key: "--card", label: "Card background" },
  { key: "--card-foreground", label: "Card text" },
  { key: "--primary", label: "Primary / button background" },
  { key: "--primary-foreground", label: "Primary button text" },
  { key: "--secondary", label: "Secondary background" },
  { key: "--secondary-foreground", label: "Secondary text" },
  { key: "--muted", label: "Muted background" },
  { key: "--muted-foreground", label: "Muted text" },
  { key: "--accent", label: "Accent" },
  { key: "--accent-foreground", label: "Accent text" },
  { key: "--destructive", label: "Destructive / danger" },
  { key: "--destructive-foreground", label: "Destructive text" },
  { key: "--border", label: "Borders" },
  { key: "--input", label: "Input borders" },
  { key: "--ring", label: "Focus ring" },
];

const RADIUS_OPTIONS = [
  { value: "0rem", label: "Square" },
  { value: "0.375rem", label: "Small" },
  { value: "0.625rem", label: "Medium (default)" },
  { value: "1rem", label: "Large" },
  { value: "1.5rem", label: "Pill" },
];

const FONT_SCALE_OPTIONS = [
  { value: "0.9375", label: "Compact" },
  { value: "1", label: "Default" },
  { value: "1.0625", label: "Large" },
  { value: "1.125", label: "Extra large" },
];

function cssColorToHex(css: string): string {
  if (typeof document === "undefined") return "#000000";
  if (/^#[0-9a-f]{6}$/i.test(css)) return css;
  try {
    const el = document.createElement("div");
    el.style.color = css;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = rgb.match(/[\d.]+/g);
    if (!m) return "#000000";
    const [r, g, b] = m.map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))));
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return "#000000";
  }
}

type ThemeVars = Record<string, string>;

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="flex-1 truncate text-sm">{label}</span>
      <input
        type="color"
        value={cssColorToHex(value || "#000000")}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 cursor-pointer rounded border"
        aria-label={`${label} colour picker`}
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-40 font-mono text-xs"
      />
    </div>
  );
}

function AdminThemingPage() {
  const qc = useQueryClient();
  const list = useServerFn(listThemes);
  const create = useServerFn(createTheme);
  const update = useServerFn(updateTheme);
  const setActive = useServerFn(setActiveTheme);
  const del = useServerFn(deleteTheme);

  const q = useQuery({ queryKey: ["admin", "themes"], queryFn: () => list() });
  const themes = (q.data ?? []) as any[];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = themes.find((t) => t.id === selectedId) ?? themes.find((t) => t.is_active) ?? themes[0];

  const [name, setName] = useState("");
  const [radius, setRadius] = useState("0.625rem");
  const [fontScale, setFontScale] = useState("1");
  const [light, setLight] = useState<ThemeVars>({});
  const [dark, setDark] = useState<ThemeVars>({});
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setRadius(selected.radius);
      setFontScale(String(selected.font_scale));
      setLight(selected.light ?? {});
      setDark(selected.dark ?? {});
    }
  }, [selected?.id]);

  const saveMut = useMutation({
    mutationFn: () => update({ data: { id: selected!.id, name, radius, fontScale: Number(fontScale), light, dark } }),
    onSuccess: () => {
      toast.success("Theme saved");
      qc.invalidateQueries({ queryKey: ["admin", "themes"] });
      qc.invalidateQueries({ queryKey: ["active-theme"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () => create({
      data: {
        name: `${name} copy`,
        radius,
        fontScale: Number(fontScale),
        light,
        dark,
      },
    }),
    onSuccess: (row: any) => {
      toast.success("Theme created");
      setSelectedId(row.id);
      qc.invalidateQueries({ queryKey: ["admin", "themes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => setActive({ data: { id } }),
    onSuccess: () => {
      toast.success("Theme activated for all users");
      qc.invalidateQueries({ queryKey: ["admin", "themes"] });
      qc.invalidateQueries({ queryKey: ["active-theme"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Theme deleted");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["admin", "themes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const previewVars = previewMode === "light" ? light : dark;
  const setPreviewVars = previewMode === "light" ? setLight : setDark;

  return (
    <AppShell title="Admin — Theming">
      <AdminTabs active="theming" />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Themes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {themes.map((t) => (
              <div
                key={t.id}
                className={`group flex items-center gap-2 rounded-md border p-2 ${selected?.id === t.id ? "border-primary bg-muted/50" : ""}`}
              >
                <button onClick={() => setSelectedId(t.id)} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    {t.is_active && <Badge className="h-5 text-[10px]">active</Badge>}
                  </div>
                </button>
                {!t.is_active && (
                  <Button size="icon" variant="ghost" title="Set active" onClick={() => activateMut.mutate(t.id)}>
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                )}
                {!t.is_active && (
                  <Button size="icon" variant="ghost" title="Delete" onClick={() => { if (confirm("Delete theme?")) deleteMut.mutate(t.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full" disabled={!selected || createMut.isPending} onClick={() => createMut.mutate()}>
              <Plus className="mr-1 h-4 w-4" /> Duplicate as new theme
            </Button>
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader>
              <CardTitle>Edit theme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Theme name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Button / card shape</Label>
                  <Select value={radius} onValueChange={setRadius}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RADIUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Font size</Label>
                  <Select value={fontScale} onValueChange={setFontScale}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_SCALE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as "light" | "dark")}>
                <TabsList>
                  <TabsTrigger value="light">Light</TabsTrigger>
                  <TabsTrigger value="dark">Dark</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  {COLOR_VARS.map((v) => (
                    <ColorRow
                      key={v.key}
                      label={v.label}
                      value={previewVars[v.key] ?? ""}
                      onChange={(val) => setPreviewVars({ ...previewVars, [v.key]: val })}
                    />
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Live preview</p>
                  <div
                    style={{ ...previewVars, "--radius": radius } as CSSProperties}
                    className="space-y-3 rounded-lg border bg-background p-4 text-foreground"
                  >
                    <div className="rounded-md border bg-card p-3 text-card-foreground">
                      <p className="text-sm font-semibold">Sample card</p>
                      <p className="text-xs text-muted-foreground">This preview updates live as you edit colours.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button>Primary</Button>
                      <Button variant="secondary">Secondary</Button>
                      <Button variant="outline">Outline</Button>
                      <Button variant="destructive">Destructive</Button>
                    </div>
                    <Input placeholder="Sample input" />
                    <div className="flex gap-2">
                      <Badge>Badge</Badge>
                      <Badge variant="outline">Outline badge</Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Button className="w-full sm:w-auto" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Saving…" : "Save theme"}
                </Button>
                {!selected.is_active && (
                  <Button className="w-full sm:w-auto" variant="outline" onClick={() => activateMut.mutate(selected.id)}>
                    Make active for all users
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
