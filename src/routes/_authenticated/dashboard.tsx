import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { bulkIngestProperties, mergeJsonIntoProperty, listProperties } from "@/lib/ingest.functions";
import { getOrCreateDefaultPersona } from "@/lib/personas.functions";
import { parsePropertyFilterCsv } from "@/lib/parsers/csv";
import { parsePropertyFilterJson } from "@/lib/parsers/json";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, FileJson, ClipboardPaste, FileSpreadsheet, Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Ingest — Deal Sourcer" }] }),
  component: Dashboard,
});

function Dashboard() {
  const router = useRouter();
  const qc = useQueryClient();
  const ingest = useServerFn(bulkIngestProperties);
  const mergeJson = useServerFn(mergeJsonIntoProperty);
  const ensurePersona = useServerFn(getOrCreateDefaultPersona);
  const list = useServerFn(listProperties);

  // Ensure persona exists on mount
  useQuery({ queryKey: ["persona-default"], queryFn: () => ensurePersona({ data: {} } as any) });
  const recent = useQuery({ queryKey: ["properties"], queryFn: () => list() });

  const [csvText, setCsvText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  const csvMut = useMutation({
    mutationFn: async (text: string) => {
      const rows = parsePropertyFilterCsv(text);
      if (!rows.length) throw new Error("No rows found in CSV");
      const items = rows.map((r) => ({ ...r, source: "property_filter_csv" }));
      return ingest({ data: { items } });
    },
    onSuccess: (r) => {
      toast.success(`Ingested ${r.inserted.length} properties`);
      qc.invalidateQueries({ queryKey: ["properties"] });
      setCsvText("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const jsonMut = useMutation({
    mutationFn: async (text: string) => {
      // Allow concatenated JSON objects or array
      const trimmed = text.trim();
      let inputs: any[] = [];
      try {
        const parsed = JSON.parse(trimmed);
        inputs = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // try splitting on }\n{
        inputs = trimmed.split(/}\s*\n\s*{/).map((s, i, arr) => {
          let chunk = s;
          if (i > 0) chunk = "{" + chunk;
          if (i < arr.length - 1) chunk = chunk + "}";
          return JSON.parse(chunk);
        });
      }
      const parsedItems = inputs.map(parsePropertyFilterJson).filter(Boolean) as ReturnType<typeof parsePropertyFilterJson>[];
      if (!parsedItems.length) throw new Error("No valid Property Filter JSON detected");
      const items = parsedItems.map((p) => ({ ...(p as any), source: "property_filter_json" }));
      return ingest({ data: { items } });
    },
    onSuccess: (r) => {
      toast.success(`Ingested ${r.inserted.length} properties`);
      qc.invalidateQueries({ queryKey: ["properties"] });
      setJsonText("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onCsvFile = async (f: File) => {
    const text = await f.text();
    csvMut.mutate(text);
  };
  const onJsonFiles = async (files: FileList) => {
    const texts = await Promise.all(Array.from(files).map((f) => f.text()));
    jsonMut.mutate(texts.join("\n"));
  };

  return (
    <AppShell title="Ingest properties">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Add properties</CardTitle>
            <CardDescription>
              Upload a Property Filter CSV export, paste/upload one or many JSON details, or add manually.
              Each property is analysed against your default persona automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="csv">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="csv"><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</TabsTrigger>
                <TabsTrigger value="json"><FileJson className="mr-2 h-4 w-4" />JSON</TabsTrigger>
                <TabsTrigger value="manual"><ClipboardPaste className="mr-2 h-4 w-4" />Manual</TabsTrigger>
              </TabsList>

              <TabsContent value="csv" className="space-y-4 pt-4">
                <div
                  onClick={() => csvFileRef.current?.click()}
                  className="cursor-pointer rounded-lg border-2 border-dashed bg-muted/30 p-8 text-center hover:bg-muted/50"
                >
                  <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop or click to upload Property Filter CSV</p>
                  <p className="text-xs text-muted-foreground">Recognises ForSale, EPC, beds, area, agent, link columns.</p>
                  <input
                    type="file"
                    accept=".csv"
                    hidden
                    ref={csvFileRef}
                    onChange={(e) => e.target.files?.[0] && onCsvFile(e.target.files[0])}
                  />
                </div>
                <div className="text-center text-xs text-muted-foreground">— or paste CSV —</div>
                <Textarea rows={6} placeholder="Paste CSV content here…" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
                <Button disabled={!csvText || csvMut.isPending} onClick={() => csvMut.mutate(csvText)}>
                  {csvMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ingest CSV
                </Button>
              </TabsContent>

              <TabsContent value="json" className="space-y-4 pt-4">
                <div
                  onClick={() => jsonFileRef.current?.click()}
                  className="cursor-pointer rounded-lg border-2 border-dashed bg-muted/30 p-8 text-center hover:bg-muted/50"
                >
                  <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop or click to upload JSON file(s)</p>
                  <p className="text-xs text-muted-foreground">Property Filter detail JSON, one or many.</p>
                  <input
                    type="file"
                    accept=".json,application/json"
                    multiple
                    hidden
                    ref={jsonFileRef}
                    onChange={(e) => e.target.files && onJsonFiles(e.target.files)}
                  />
                </div>
                <div className="text-center text-xs text-muted-foreground">— or paste JSON —</div>
                <Textarea rows={10} placeholder='Paste {"propertyLight":...} or [{...},{...}]' value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
                <Button disabled={!jsonText || jsonMut.isPending} onClick={() => jsonMut.mutate(jsonText)}>
                  {jsonMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ingest JSON
                </Button>
              </TabsContent>

              <TabsContent value="manual" className="space-y-3 pt-4">
                <ManualForm onDone={() => qc.invalidateQueries({ queryKey: ["properties"] })} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent ({recent.data?.length ?? 0})</CardTitle>
            <CardDescription>Latest ingested properties.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(recent.data ?? []).slice(0, 8).map((p: any) => (
              <button
                key={p.id}
                onClick={() => router.navigate({ to: "/properties/$id", params: { id: p.id } })}
                className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.address}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.beds ? `${p.beds} bed · ` : ""}{p.property_type || "—"} · {p.epc_rate || "EPC ?"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
            {(!recent.data || recent.data.length === 0) && (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing yet. Upload a CSV to start.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ManualForm({ onDone }: { onDone: () => void }) {
  const ingest = useServerFn(bulkIngestProperties);
  const [form, setForm] = useState({
    address: "", postcode: "", beds: "3", property_type: "Terraced house",
    epc_rate: "C", asking_price_gbp: "180000", source_link: "",
  });
  const mut = useMutation({
    mutationFn: async () =>
      ingest({
        data: {
          items: [
            {
              address: form.address,
              postcode: form.postcode || null,
              beds: form.beds ? parseInt(form.beds) : null,
              property_type: form.property_type || null,
              epc_rate: form.epc_rate || null,
              asking_price_gbp: form.asking_price_gbp ? parseFloat(form.asking_price_gbp) : null,
              source_link: form.source_link || null,
              source: "manual",
            },
          ],
        },
      }),
    onSuccess: () => {
      toast.success("Property added");
      onDone();
      setForm({ ...form, address: "", source_link: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label>Address *</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      <div><Label>Postcode</Label><Input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} /></div>
      <div><Label>Beds</Label><Input type="number" value={form.beds} onChange={(e) => setForm({ ...form, beds: e.target.value })} /></div>
      <div><Label>Type</Label><Input value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })} /></div>
      <div><Label>EPC</Label><Input value={form.epc_rate} onChange={(e) => setForm({ ...form, epc_rate: e.target.value })} /></div>
      <div><Label>Asking price £</Label><Input type="number" value={form.asking_price_gbp} onChange={(e) => setForm({ ...form, asking_price_gbp: e.target.value })} /></div>
      <div className="sm:col-span-2"><Label>Listing URL</Label><Input value={form.source_link} onChange={(e) => setForm({ ...form, source_link: e.target.value })} /></div>
      <div className="sm:col-span-2">
        <Button disabled={!form.address || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add property
        </Button>
      </div>
    </div>
  );
}