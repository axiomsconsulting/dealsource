import { supabase } from "@/integrations/supabase/client";

export type Article4Status = "unknown" | "inside" | "partial" | "outside";

let cache: { prefix: string; scope: string; council: string | null }[] | null = null;
let inflight: Promise<void> | null = null;

async function ensureCache() {
  if (cache) return;
  if (!inflight) {
    inflight = (async () => {
      const { data } = await supabase.from("article4_areas").select("postcode_prefix,scope,council");
      cache = (data ?? []).map((r: any) => ({ prefix: r.postcode_prefix.toUpperCase(), scope: r.scope, council: r.council }));
    })();
  }
  await inflight;
}

function outwardCode(postcode: string | null | undefined): string | null {
  if (!postcode) return null;
  const m = postcode.toUpperCase().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  return m ? m[1] : null;
}

export async function lookupArticle4(postcode: string | null | undefined): Promise<{ status: Article4Status; council: string | null }> {
  const out = outwardCode(postcode);
  if (!out) return { status: "unknown", council: null };
  await ensureCache();
  const hit = cache!.find((c) => c.prefix === out);
  if (!hit) return { status: "unknown", council: null };
  return { status: hit.scope === "full" ? "inside" : "partial", council: hit.council };
}

// Synchronous server-side helper (e.g. for ingest server fn using its own supabase client)
export async function lookupArticle4WithClient(
  client: { from: (t: string) => any },
  postcode: string | null | undefined,
): Promise<{ status: Article4Status; council: string | null }> {
  const out = outwardCode(postcode);
  if (!out) return { status: "unknown", council: null };
  const { data } = await client.from("article4_areas").select("scope,council").eq("postcode_prefix", out).maybeSingle();
  if (!data) return { status: "unknown", council: null };
  return { status: data.scope === "full" ? "inside" : "partial", council: data.council };
}