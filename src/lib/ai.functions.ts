import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { isFloorPlan, partitionImageUrls } from "@/lib/images";
import { estimateMaxHmoRoomsByArea, HMO_MIN_SINGLE_ROOM_SQM, HMO_MIN_DOUBLE_ROOM_SQM } from "@/lib/analysis/hmo-layout";

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
  landlordReadiness: z.object({
    whiteGoodsMissing: z.array(z.enum(["fridge/freezer", "washing machine", "oven/hob"])).max(3).optional(),
    gardenNeedsClearance: z.boolean().optional(),
  }).optional(),
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
{"summary":"...","conditionScore":0-10,"items":[{"category":"kitchen|bathroom|rewire|replumb|boiler|windows|roof|external|damp|plaster_decor|flooring|epc_upgrade|structural|other","issue":"short description","severity":"low|medium|high","estimateGbp":0,"photoIndex":0}],"landlordReadiness":{"whiteGoodsMissing":["fridge/freezer","washing machine","oven/hob"],"gardenNeedsClearance":true|false}}
For landlordReadiness: only list a white good in whiteGoodsMissing if a kitchen/utility photo is visible AND that appliance is clearly absent — omit the field entirely if no kitchen photo is present. Set gardenNeedsClearance true only if an exterior/garden/yard photo shows it overgrown, cluttered or full of debris.
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
      ...(parsed.landlordReadiness ? {
        landlordReadiness: {
          ...(prev.landlordReadiness ?? {}),
          ...parsed.landlordReadiness,
        },
      } : {}),
    };
    const row = { ai_payload: merged, ai_version: AI_VERSION, ai_used_at: new Date().toISOString() };
    if (existing) await context.supabase.from("analyses").update(row).eq("id", existing.id);
    else await context.supabase.from("analyses").insert({ user_id: context.userId, property_id: data.propertyId, ...row });
    return { items, summary: parsed.summary, conditionScore: parsed.conditionScore };
  });

/* ------------------------------------------------------------------ */
/* Per-issue viewing photo analysis                                    */
/* ------------------------------------------------------------------ */

const ViewingIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  note: z.string().max(500),
  estimateGbp: z.number().min(0).max(80000),
});

/** Vision pass over the photos a user captured on-site for a single survey issue (e.g. "damp",
 *  "structural", "external_grounds") during a property viewing — suggests a severity, a short
 *  note describing what's visible, and a remediation cost estimate. The user reviews and can
 *  edit before it's saved into `property.survey_findings[issueKey]`. */
export const analyseViewingIssuePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ propertyId: z.string().uuid(), issueKey: z.string().max(50) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: prop } = await context.supabase
      .from("properties").select("address, property_type").eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (!prop) throw new Error("Property not found");

    const { data: photos } = await context.supabase
      .from("photos").select("storage_path")
      .eq("property_id", data.propertyId).eq("issue_key", data.issueKey).limit(8);
    if (!photos?.length) throw new Error("No photos for this issue yet — take or add a photo first.");

    const urls: string[] = [];
    for (const ph of photos) {
      const { data: signed } = await context.supabase.storage.from("property-photos").createSignedUrl(ph.storage_path, 600);
      if (signed?.signedUrl) urls.push(signed.signedUrl);
    }

    const provider = createLovableAiGatewayProvider(getKey());
    const model = provider("google/gemini-2.5-flash");

    const issueLabel = data.issueKey.replace(/_/g, " ");
    const system = `You are a UK property surveyor assessing "${issueLabel}" from photos taken during a viewing of ${prop.address} (${prop.property_type ?? "residential"}). Output STRICT JSON only, matching:
{"severity":"low|medium|high","note":"short description of what's visible and why it matters","estimateGbp":0}
Use UK 2026 trade prices for remediation. Be conservative.`;

    const content: any[] = [
      { type: "text", text: `${urls.length} photo(s) attached, all showing "${issueLabel}".` },
      ...urls.map((u) => ({ type: "image", image: u })),
    ];

    try {
      const { text } = await generateText({ model, messages: [{ role: "system", content: system }, { role: "user", content }] });
      return ViewingIssueSchema.parse(parseJsonBlock(text));
    } catch (e: any) {
      throw new Error("Photo AI failed: " + e.message);
    }
  });

/* ------------------------------------------------------------------ */
/* Free-form viewing notes -> survey findings                          */
/* ------------------------------------------------------------------ */

const SURVEY_ISSUE_KEYS = [
  "structural", "roof", "asbestos", "non_standard_construction",
  "damp", "timber_decay", "windows_joinery", "drainage_rainwater",
  "electrics_plumbing", "insulation_energy", "japanese_knotweed", "external_grounds",
] as const;

const ViewingNotesAnalysisSchema = z.object({
  findings: z.array(z.object({
    issueKey: z.enum(SURVEY_ISSUE_KEYS),
    severity: z.enum(["low", "medium", "high"]),
    note: z.string().max(300),
  })).max(SURVEY_ISSUE_KEYS.length),
});

/** Reads the free-form notes captured during a property viewing (a general box plus one box
 *  per area — kitchen, bedrooms, garden, roof, etc.) and maps anything described onto the
 *  fixed `SurveyIssueKey` taxonomy with a severity, regardless of which box it was written in.
 *  The result is merged into `property.survey_findings`, so it immediately becomes negotiation
 *  leverage (see `buildSurveyNegotiationPoints`) and totals up in the refurb estimator. */
export const analyseViewingNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      propertyId: z.string().uuid(),
      notes: z.record(z.string(), z.string().max(4000)),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: prop } = await context.supabase
      .from("properties").select("address, property_type").eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (!prop) throw new Error("Property not found");

    const sections = Object.entries(data.notes)
      .map(([area, text]) => [area, text.trim()] as const)
      .filter(([, text]) => text.length > 0);
    if (!sections.length) throw new Error("Add some notes before analysing.");

    const provider = createLovableAiGatewayProvider(getKey());
    const model = provider("google/gemini-2.5-flash");

    const system = `You are a UK property surveyor reviewing a buyer's freeform notes from a viewing of ${prop.address} (${prop.property_type ?? "residential"}). The notes are organised by area but an issue may be described in any box (including "general") — read all of them together.

Map anything described onto this fixed issue list (use these exact keys): ${SURVEY_ISSUE_KEYS.join(", ")}.

For each issue you find clear evidence of, return a severity ("low"|"medium"|"high" — based on how serious the described problem sounds) and a short note summarising what was observed and where. Do not invent issues that aren't mentioned. Output STRICT JSON only:
{"findings":[{"issueKey":"damp","severity":"medium","note":"Damp patch noted on kitchen wall"}]}`;

    const user = sections.map(([area, text]) => `[${area}]\n${text}`).join("\n\n");

    try {
      const { text } = await generateText({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
      return ViewingNotesAnalysisSchema.parse(parseJsonBlock(text));
    } catch (e: any) {
      throw new Error("Notes AI failed: " + e.message);
    }
  });

/* ------------------------------------------------------------------ */
/* HMO/SA floor-plan layout assessment                                 */
/* ------------------------------------------------------------------ */

const HmoLayoutSchema = z.object({
  summary: z.string().max(700).optional(),
  recommendedRooms: z.number().int().min(0).max(20).optional(),
  /** AI's overall recommended count of ensuites to build — own-room conversions plus any
   *  adjacent-room knock-throughs flagged below — kept consistent with the per-room judgements. */
  recommendedEnsuites: z.number().int().min(0).max(20).optional(),
  rooms: z.array(z.object({
    label: z.string(),
    approxSqm: z.number().min(0).max(100).optional(),
    meetsMinStandard: z.boolean().optional(),
    ensuitePossible: z.boolean().optional(),
    /** When this room itself can't take an ensuite, whether knocking through to the named
     *  adjacent room would let THAT room host an ensuite, and its resulting area afterwards. */
    adjacentEnsuite: z.object({
      adjacentRoomLabel: z.string(),
      possible: z.boolean(),
      resultingAdjacentSqm: z.number().min(0).max(100).optional(),
      notes: z.string().max(300).optional(),
    }).optional(),
    notes: z.string().max(1000).optional(),
  })).max(20).optional(),
  saUnits: z.array(z.object({
    label: z.string(),
    approxSqm: z.number().min(0).max(150).optional(),
    ensuiteAndKitchenettePossible: z.boolean().optional(),
    notes: z.string().max(1000).optional(),
  })).max(10).optional(),
  caveats: z.string().max(2000).optional(),
});

/** Floor-plan-driven HMO/SA layout assessment — two layers, kept clearly separate so the user
 *  can see where the "hard" numbers end and the AI's visual judgement begins:
 *   1. A deterministic ceiling on lettable bedrooms from total floor area against the *statutory*
 *      minimum HMO bedroom size (6.51m² single-occupant) — arithmetic against a published
 *      standard, independent of any model call, computed by `estimateMaxHmoRoomsByArea`.
 *   2. A vision pass over the actual floor plan image(s) — the only source that can speak to
 *      *where* walls/doors/plumbing actually sit — proposing a room-by-room conversion within
 *      that ceiling, judging per-room ensuite feasibility, and flagging any self-contained
 *      ensuite+kitchenette unit a serviced-accommodation (SA) strategy could carve out. */
export const analyseHmoLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prop } = await context.supabase
      .from("properties").select("*").eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (!prop) throw new Error("Property not found");

    const { data: photos } = await context.supabase
      .from("photos").select("*").eq("property_id", data.propertyId);
    const storedFloorPlans = (photos ?? []).filter((p: any) => isFloorPlan(p.caption, p.storage_path));
    const urls: string[] = [];
    for (const ph of storedFloorPlans) {
      const { data: signed } = await context.supabase.storage.from("property-photos").createSignedUrl(ph.storage_path, 600);
      if (signed?.signedUrl) urls.push(signed.signedUrl);
    }
    const externalAll: string[] = Array.isArray(prop.image_urls) ? prop.image_urls : [];
    const { floorPlans: externalFloorPlans } = partitionImageUrls(externalAll);
    const all = [...urls, ...externalFloorPlans].slice(0, 6);
    if (!all.length) throw new Error("No floor plan image found — upload one or fetch the listing's floor plan first. Layout analysis needs to see the actual room arrangement, not just photos.");

    const areaEstimate = estimateMaxHmoRoomsByArea(prop.area_sqm);

    const provider = createLovableAiGatewayProvider(getKey());
    const model = provider("google/gemini-2.5-flash");

    const system = `You are a UK HMO/serviced-accommodation conversion surveyor. Examine the floor plan image(s) and propose a realistic room-by-room conversion into individually-let bedrooms.

Hard rules — do not propose anything that breaches these:
- Single-occupant bedroom (person aged 10+): minimum ${HMO_MIN_SINGLE_ROOM_SQM} m²
- Two persons sharing a bedroom: minimum ${HMO_MIN_DOUBLE_ROOM_SQM} m²
- Never suggest more bedrooms than the floor-area ceiling provided in the user message
- Don't propose layouts that would remove the only fire escape route from a room, or require moving structural walls, soil stacks or staircases

For each proposed bedroom, judge from the actual layout (door/window positions, adjacent plumbing, room shape) whether there is realistically space to partition off a small ensuite shower/WC without the remaining bedroom area dropping below the minimum. If a room CANNOT take its own ensuite, additionally judge whether knocking through the wall/door it shares with an adjacent bedroom would let THAT adjacent room host an ensuite without dropping its own area below the minimum — if so, name the adjacent room and estimate its resulting floor area after the ensuite is carved out of it. Separately, identify whether any part of the property (e.g. a larger room, loft, or annexe shown on the plan) could be configured as a fully self-contained unit — its own ensuite AND kitchenette — suitable for serviced-accommodation (SA) letting. Finally, set "recommendedEnsuites" to the total number of ensuites you'd actually recommend building (own-room conversions plus any adjacent-room knock-throughs you flagged as possible) — be conservative and keep this consistent with the per-room judgements above. Be conservative: if the plan doesn't clearly support a claim, say so in "notes" rather than asserting it. Output STRICT JSON ONLY, matching:
{"summary":"...","recommendedRooms":0,"recommendedEnsuites":0,"rooms":[{"label":"Room 1 — front double bedroom","approxSqm":12,"meetsMinStandard":true,"ensuitePossible":true,"adjacentEnsuite":{"adjacentRoomLabel":"Room 2 — rear bedroom","possible":false,"resultingAdjacentSqm":9,"notes":"..."},"notes":"..."}],"saUnits":[{"label":"Loft conversion — self-contained studio","approxSqm":22,"ensuiteAndKitchenettePossible":true,"notes":"..."}],"caveats":"..."}`;

    const contextLine = areaEstimate
      ? `Floor-area ceiling at the statutory minimum bedroom size (after reserving ~${Math.round(areaEstimate.communalReservePct * 100)}% of ${areaEstimate.totalAreaSqm}m² total for kitchen/bathrooms/circulation, leaving ~${areaEstimate.lettableAreaSqm}m² lettable): no more than ${areaEstimate.maxRooms} bedroom(s). Do not propose more than this.`
      : `No total floor area is on file for this property — judge bedroom count from the plan's drawn dimensions/scale only, and say so in "caveats" if the plan has no scale or dimensions.`;

    const content: any[] = [
      { type: "text", text: `Property: ${prop.address}\nType: ${prop.property_type ?? "?"}, currently ${prop.beds ?? "?"} bed${prop.area_sqm ? `, ${prop.area_sqm}m² total` : ""}.\n${contextLine}\n${all.length} floor plan image(s) attached.` },
      ...all.map((u) => ({ type: "image", image: u })),
    ];

    let parsed: any;
    try {
      const { text } = await generateText({ model, messages: [{ role: "system", content: system }, { role: "user", content }] });
      parsed = HmoLayoutSchema.parse(parseJsonBlock(text));
    } catch (e: any) {
      throw new Error("Floor plan layout AI failed: " + e.message);
    }

    const hmoLayout = { ...parsed, areaEstimate, analysedAt: new Date().toISOString() };

    const { data: existing } = await context.supabase
      .from("analyses").select("id, ai_payload").eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    const prev = (existing?.ai_payload ?? {}) as any;
    const merged = { ...prev, hmoLayout };
    const row = { ai_payload: merged, ai_version: AI_VERSION, ai_used_at: new Date().toISOString() };
    if (existing) await context.supabase.from("analyses").update(row).eq("id", existing.id);
    else await context.supabase.from("analyses").insert({ user_id: context.userId, property_id: data.propertyId, ...row });

    return hmoLayout;
  });

/* ------------------------------------------------------------------ */
/* Listing photo room tagging — groups the image library by room      */
/* ------------------------------------------------------------------ */

const ROOM_KEYS = ["lounge", "dining", "kitchen", "bedroom", "bathroom", "garden", "landing", "exterior", "other"] as const;
export const ROOM_LABELS: Record<(typeof ROOM_KEYS)[number], string> = {
  lounge: "Lounge / living room",
  dining: "Dining room",
  kitchen: "Kitchen",
  bedroom: "Bedroom(s)",
  bathroom: "Bathroom",
  garden: "Garden",
  landing: "Landing / hallway",
  exterior: "Outside / exterior",
  other: "Other",
};

const ImageTagsSchema = z.object({
  tags: z.array(z.object({
    index: z.number().int().min(0),
    room: z.enum(ROOM_KEYS),
    label: z.string().max(80),
  })).max(60),
});

/** Tags every listing photo with the room it shows and a short caption — a one-off, cached vision
 *  pass (google/gemini-2.5-flash, the cheapest vision-capable model on the gateway) so the image
 *  library can group "Lounge / Kitchen / Bedrooms / Garden / ..." automatically without re-running
 *  on every page view. Persisted into analyses.ai_payload.imageTags, keyed by URL so it survives
 *  re-ordering of the listing's own image array. */
export const categoriseListingImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: prop } = await context.supabase
      .from("properties").select("image_urls").eq("id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (!prop) throw new Error("Property not found");

    const all: string[] = Array.isArray(prop.image_urls) ? prop.image_urls : [];
    const { photos } = partitionImageUrls(all);
    const urls = Array.from(new Set(photos)).slice(0, 30);
    if (!urls.length) throw new Error("No listing photos to organise — this property has no photo gallery on file.");

    const provider = createLovableAiGatewayProvider(getKey());
    const model = provider("google/gemini-2.5-flash");

    const system = `You are organising a UK property listing's photo gallery by room. For EVERY photo given (in order, indices 0..N-1), identify which room/area it shows and write a short (3-6 word) caption describing what's notable in it (e.g. "Lounge with bay window", "Kitchen — fitted units", "Rear garden, lawned"). Output STRICT JSON only, matching:
{"tags":[{"index":0,"room":"lounge|dining|kitchen|bedroom|bathroom|garden|landing|exterior|other","label":"short caption"}]}
One entry per photo, in index order. Use "other" only when truly ambiguous (hallway storage cupboards, utility rooms, unclear angles).`;

    const content: any[] = [
      { type: "text", text: `${urls.length} listing photos attached, indices 0..${urls.length - 1}.` },
      ...urls.map((u) => ({ type: "image", image: u })),
    ];

    let parsed: any;
    try {
      const { text } = await generateText({ model, messages: [{ role: "system", content: system }, { role: "user", content }] });
      parsed = ImageTagsSchema.parse(parseJsonBlock(text));
    } catch (e: any) {
      throw new Error("Photo organiser AI failed: " + e.message);
    }

    const byUrl: Record<string, { room: string; label: string }> = {};
    for (const t of parsed.tags ?? []) {
      const url = urls[t.index];
      if (url) byUrl[url] = { room: t.room, label: t.label };
    }

    const { data: existing } = await context.supabase
      .from("analyses").select("id, ai_payload").eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    const prev = (existing?.ai_payload ?? {}) as any;
    const imageTags = { byUrl, taggedAt: new Date().toISOString() };
    const merged = { ...prev, imageTags };
    const row = { ai_payload: merged, ai_version: AI_VERSION, ai_used_at: new Date().toISOString() };
    if (existing) await context.supabase.from("analyses").update(row).eq("id", existing.id);
    else await context.supabase.from("analyses").insert({ user_id: context.userId, property_id: data.propertyId, ...row });

    return imageTags;
  });

/* ------------------------------------------------------------------ */
/* Seller-flex estimate (comparables-based)                           */
/* ------------------------------------------------------------------ */

const FlexSchema = z.object({
  reductionPctLow: z.number().min(0).max(0.4).optional(),
  reductionPctMid: z.number().min(0).max(0.4).optional(),
  reductionPctHigh: z.number().min(0).max(0.4).optional(),
  rationale: z.string().max(2000).optional(),
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