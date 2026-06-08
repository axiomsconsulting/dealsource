import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const PayloadSchema = z.object({
  condition: z.object({
    score: z.number().min(0).max(10).optional(),
    summary: z.string().max(800).optional(),
    items: z.array(z.object({
      area: z.string(),
      issue: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      estimateGbp: z.number().min(0).max(80000),
      category: z.string().optional(),
    })).max(25).optional(),
  }).optional(),
  refurb: z.object({
    totalLow: z.number().optional(),
    totalMid: z.number().optional(),
    totalHigh: z.number().optional(),
    items: z.array(z.object({
      category: z.string(),
      issue: z.string().optional(),
      estimateGbp: z.number().min(0).max(80000),
    })).max(30).optional(),
  }).optional(),
  rent: z.object({
    pcm: z.number().min(0).max(50000).optional(),
    low: z.number().optional(),
    high: z.number().optional(),
    evidence: z.array(z.string()).max(8).optional(),
  }).optional(),
  article4: z.object({
    status: z.enum(["unknown", "inside", "outside", "partial"]).optional(),
    council: z.string().optional(),
    evidence: z.string().optional(),
  }).optional(),
  riskFlags: z.object({
    sharedOwnership: z.boolean().optional(),
    leasehold: z.boolean().optional(),
    listed: z.boolean().optional(),
    auction: z.boolean().optional(),
    developerInvite: z.boolean().optional(),
    land: z.boolean().optional(),
    planningOnly: z.boolean().optional(),
    notes: z.string().optional(),
  }).optional(),
  negotiation: z.object({
    angles: z.array(z.string()).max(10).optional(),
    suggestedOfferGbp: z.number().optional(),
    walkAwayGbp: z.number().optional(),
  }).optional(),
  strategyHints: z.object({
    suitable: z.array(z.string()).optional(),
    unsuitable: z.array(z.string()).optional(),
    reasoning: z.string().optional(),
  }).optional(),
});

export type AIPayload = z.infer<typeof PayloadSchema>;
const AI_VERSION = "p3.1";

function getKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY missing");
  return k;
}

function parseJsonBlock(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response");
  return JSON.parse(raw.slice(start, end + 1));
}

export const analyseWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    return await runFullAnalysis(context, data.propertyId);
  });

// Exported helper so background job runner (ai-jobs.functions) can invoke without going through RPC
export async function runFullAnalysisForJob(context: any, propertyId: string) {
  return runFullAnalysis(context, propertyId);
}

/* ------------------------------------------------------------------ */
/* Photo-only refurb vision analysis                                  */
/* ------------------------------------------------------------------ */

const PhotoRefurbSchema = z.object({
  summary: z.string().max(800).optional(),
  conditionScore: z.number().min(0).max(10).optional(),
  items: z.array(z.object({
    category: z.string(),
    issue: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    estimateGbp: z.number().min(0).max(80000),
    photoIndex: z.number().int().min(0).optional(),
  })).max(40).optional(),
});

export const analysePhotosForRefurb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prop } = await context.supabase
      .from("properties").select("*").eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (!prop) throw new Error("Property not found");

    const { data: photos } = await context.supabase
      .from("photos").select("*").eq("property_id", data.propertyId).limit(12);
    const urls: string[] = [];
    for (const ph of photos ?? []) {
      const { data: signed } = await context.supabase.storage.from("property-photos").createSignedUrl(ph.storage_path, 600);
      if (signed?.signedUrl) urls.push(signed.signedUrl);
    }
    const external: string[] = Array.isArray(prop.image_urls) ? prop.image_urls.slice(0, 4) : [];
    const all = [...urls, ...external].slice(0, 14);
    if (!all.length) throw new Error("Upload at least one photo first.");

    const provider = createLovableAiGatewayProvider(getKey());
    const model = provider("google/gemini-2.5-flash");

    const system = `You are a UK property surveyor. Look at the provided photos and produce a refurbishment issue list. Output STRICT JSON only, matching:
{"summary":"...","conditionScore":0-10,"items":[{"category":"kitchen|bathroom|rewire|replumb|boiler|windows|roof|external|damp|plaster_decor|flooring|epc_upgrade|structural|other","issue":"short description","severity":"low|medium|high","estimateGbp":0,"photoIndex":0}]}
Use UK 2026 trade prices. Be conservative.`;

    const content: any[] = [
      { type: "text", text: `Property: ${prop.address}\nType: ${prop.property_type ?? "?"}, ${prop.beds ?? "?"} bed, ${prop.area_sqm ?? "?"}m², EPC ${prop.epc_rate ?? "?"}.\n${all.length} photos attached (indices 0..${all.length - 1}).` },
      ...all.map((u) => ({ type: "image", image: u })),
    ];

    let parsed: any;
    try {
      const { text } = await generateText({ model, messages: [{ role: "system", content: system }, { role: "user", content }] });
      parsed = PhotoRefurbSchema.parse(parseJsonBlock(text));
    } catch (e: any) {
      throw new Error("Photo AI failed: " + e.message);
    }

    // Merge into ai_payload.refurb.items via analyses row
    const { data: existing } = await context.supabase
      .from("analyses").select("id, ai_payload").eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    const prev = (existing?.ai_payload ?? {}) as any;
    const items = parsed.items ?? [];
    const merged = {
      ...prev,
      condition: {
        ...(prev.condition ?? {}),
        score: parsed.conditionScore ?? prev.condition?.score,
        summary: parsed.summary ?? prev.condition?.summary,
        photoFindings: items,
      },
      refurb: {
        ...(prev.refurb ?? {}),
        items: [
          ...((prev.refurb?.items ?? []) as any[]).filter((x: any) => !items.some((i: any) => i.category === x.category && i.issue === x.issue)),
          ...items.map((i: any) => ({ category: i.category, issue: i.issue, estimateGbp: i.estimateGbp })),
        ],
      },
    };
    const row = { ai_payload: merged, ai_version: AI_VERSION, ai_used_at: new Date().toISOString() };
    if (existing) await context.supabase.from("analyses").update(row).eq("id", existing.id);
    else await context.supabase.from("analyses").insert({ user_id: context.userId, property_id: data.propertyId, ...row });
    return { items, summary: parsed.summary, conditionScore: parsed.conditionScore };
  });

/* ------------------------------------------------------------------ */
/* Seller-flex estimate (comparables-based)                           */
/* ------------------------------------------------------------------ */

const FlexSchema = z.object({
  reductionPctLow: z.number().min(0).max(0.4).optional(),
  reductionPctMid: z.number().min(0).max(0.4).optional(),
  reductionPctHigh: z.number().min(0).max(0.4).optional(),
  rationale: z.string().max(600).optional(),
  comparables: z.array(z.object({ note: z.string(), gbp: z.number().optional() })).max(8).optional(),
  marketTemp: z.enum(["hot", "balanced", "cold"]).optional(),
});

export const estimateSellerFlex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prop } = await context.supabase
      .from("properties").select("*").eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (!prop) throw new Error("Property not found");

    const provider = createLovableAiGatewayProvider(getKey());
    const model = provider("google/gemini-2.5-flash");
    const system = `You estimate realistic seller flexibility on UK residential property based on local market dynamics and recent sold comparables for the postcode. Output STRICT JSON ONLY:
{"reductionPctLow":0.02,"reductionPctMid":0.06,"reductionPctHigh":0.12,"rationale":"...","marketTemp":"hot|balanced|cold","comparables":[{"note":"3-bed terrace 0.2mi sold Jul 2025","gbp":182000}]}
Use percentages as decimals (0.05 = 5%). Be realistic — typical UK reductions are 3-8% from initial asking.`;

    const pf: any = prop.pf_json ?? {};
    const light: any = pf.propertyLight ?? {};
    const user = `Property: ${prop.address}
Postcode: ${prop.postcode ?? "?"}
Type: ${prop.property_type ?? "?"} · ${prop.beds ?? "?"} bed
Asking: £${prop.asking_price_gbp ?? "?"}
Last sold (if known): ${light.lastSold ? `£${light.lastSold.value} (${light.lastSold.date})` : "n/a"}
Reductions already taken: ${light.multipleReduce ?? 0}
Back-on-market count: ${light.multipleBack ?? 0}
EPC: ${prop.epc_rate ?? "?"}, Tenure: ${prop.tenure ?? "?"}`;

    let parsed: any;
    try {
      const { text } = await generateText({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
      parsed = FlexSchema.parse(parseJsonBlock(text));
    } catch (e: any) {
      throw new Error("Seller flex AI failed: " + e.message);
    }
    return parsed;
  });

export const getAIAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("analyses").select("ai_notes, ai_payload, ai_version, ai_used_at")
      .eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    return row ?? null;
  });

export const analyseLibraryWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(20), force: z.boolean().default(false) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: props } = await context.supabase.from("properties").select("id").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(data.limit);
    if (!props?.length) return { processed: 0 };
    const { data: existing } = await context.supabase.from("analyses").select("property_id, ai_payload").eq("user_id", context.userId);
    const have = new Set((existing ?? []).filter((r: any) => r.ai_payload).map((r: any) => r.property_id));
    const todo = data.force ? props : props.filter((p: any) => !have.has(p.id));
    let ok = 0, fail = 0;
    // run sequentially (token + rate-limit hygiene; small library expected)
    for (const p of todo) {
      try { await runFullAnalysis(context, p.id); ok++; }
      catch { fail++; }
    }
    return { processed: ok, failed: fail, total: todo.length };
  });

async function runFullAnalysis(context: any, propertyId: string): Promise<AIPayload> {
  const { data: prop, error: pe } = await context.supabase
    .from("properties").select("*").eq("id", propertyId).maybeSingle();
  if (pe || !prop) throw new Error(pe?.message || "Property not found");

  const { data: photos } = await context.supabase
    .from("photos").select("*").eq("property_id", propertyId).limit(8);

  const photoUrls: string[] = [];
  for (const ph of photos ?? []) {
    const { data: signed } = await context.supabase.storage
      .from("property-photos").createSignedUrl(ph.storage_path, 60 * 10);
    if (signed?.signedUrl) photoUrls.push(signed.signedUrl);
  }
  const externalImages: string[] = Array.isArray(prop.image_urls) ? prop.image_urls.slice(0, 8) : [];
  const allImages = [...photoUrls, ...externalImages].slice(0, 10);

  const provider = createLovableAiGatewayProvider(getKey());
  const model = provider("google/gemini-2.5-flash");

  const systemPrompt = `You are a senior UK property investment analyst (surveyor + lettings + planning).
Given listing data and (optionally) images, produce ONE structured JSON object covering condition, refurb costs (line items in £), local rent comparables (£/pcm), HMO Article 4 status for the postcode, risk flags (shared ownership, leasehold, listed, auction, developer invite, land-only, planning-only), negotiation angles with suggested offer, and suitable/unsuitable investment strategies (BTL, BRRR, SA, HMO, FLIP, TITLE_SPLIT). Be conservative. STRICT JSON ONLY (no prose, no markdown), matching this shape:
{
  "condition": {"score":0-10,"summary":"","items":[{"area":"kitchen|bathroom|roof|windows|electrics|heating|external|damp|structural|decor","issue":"","severity":"low|medium|high","estimateGbp":0,"category":"kitchen|bathroom|rewire|replumb|boiler|windows|roof|external|damp|plaster_decor|flooring|epc_upgrade|other"}]},
  "refurb": {"totalLow":0,"totalMid":0,"totalHigh":0,"items":[{"category":"","issue":"","estimateGbp":0}]},
  "rent": {"pcm":0,"low":0,"high":0,"evidence":["..."]},
  "article4": {"status":"unknown|inside|outside|partial","council":"","evidence":""},
  "riskFlags": {"sharedOwnership":false,"leasehold":false,"listed":false,"auction":false,"developerInvite":false,"land":false,"planningOnly":false,"notes":""},
  "negotiation": {"angles":["..."],"suggestedOfferGbp":0,"walkAwayGbp":0},
  "strategyHints": {"suitable":["BTL"],"unsuitable":["HMO"],"reasoning":""}
}`;

  const content: any[] = [
    { type: "text", text: `Listing: ${prop.address}\nPostcode: ${prop.postcode ?? "?"}\nType: ${prop.property_type ?? "?"}\nBeds: ${prop.beds ?? "?"} · Baths: ${prop.baths ?? "?"} · Area: ${prop.area_sqm ?? "?"}m²\nTenure: ${prop.tenure ?? "?"}\nEPC: ${prop.epc_rate ?? "?"}\nAsking: £${prop.asking_price_gbp ?? "?"}\nAgent: ${prop.agent_name ?? "?"}\nListing notes: ${prop.pf_json?.propertyDetail?.summary ?? prop.pf_json?.propertyLight?.description ?? "(none)"}\n\nImages provided: ${allImages.length}` },
    ...allImages.map((url) => ({ type: "image", image: url })),
  ];

  let payload: AIPayload;
  try {
    const { text } = await generateText({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    });
    const parsed = parseJsonBlock(text);
    payload = PayloadSchema.parse(parsed);
  } catch (e: any) {
    throw new Error("AI analysis failed: " + e.message);
  }

  // Persist back to properties (rent + article4 + risk_flags merged in)
  const updates: any = {};
  if (payload.rent?.pcm) {
    updates.estimated_rent_pcm = payload.rent.pcm;
    updates.rent_source = "ai_comparables";
  }
  if (payload.article4?.status && payload.article4.status !== "unknown") {
    updates.article4_status = payload.article4.status;
    updates.article4_source = "ai";
  }
  if (Object.keys(updates).length) {
    await context.supabase.from("properties").update(updates).eq("id", propertyId);
  }

  // Upsert analyses row
  const { data: existing } = await context.supabase
    .from("analyses").select("id").eq("property_id", propertyId).eq("user_id", context.userId).maybeSingle();
  const row = {
    ai_notes: payload.condition ? {
      conditionScore: payload.condition.score,
      summary: payload.condition.summary,
      items: payload.condition.items,
      negotiationAngles: payload.negotiation?.angles ?? [],
    } : null,
    ai_payload: payload,
    ai_version: AI_VERSION,
    ai_used_at: new Date().toISOString(),
  };
  if (existing) {
    await context.supabase.from("analyses").update(row).eq("id", existing.id);
  } else {
    await context.supabase.from("analyses").insert({ user_id: context.userId, property_id: propertyId, ...row });
  }
  return payload;
}