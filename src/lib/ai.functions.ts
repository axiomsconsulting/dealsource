import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const FindingsSchema = z.object({
  conditionScore: z.number().min(0).max(10).optional(),
  items: z.array(z.object({
    area: z.string(),
    issue: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    estimateGbp: z.number().min(0).max(50000),
  })).max(20),
  summary: z.string().max(800),
  negotiationAngles: z.array(z.string()).max(8),
});

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
    const { data: prop, error: pe } = await context.supabase
      .from("properties").select("*").eq("id", data.propertyId).maybeSingle();
    if (pe || !prop) throw new Error(pe?.message || "Property not found");

    const { data: photos } = await context.supabase
      .from("photos").select("*").eq("property_id", data.propertyId).limit(8);

    const photoUrls: string[] = [];
    for (const ph of photos ?? []) {
      const { data: signed } = await context.supabase.storage
        .from("property-photos").createSignedUrl(ph.storage_path, 60 * 10);
      if (signed?.signedUrl) photoUrls.push(signed.signedUrl);
    }

    const provider = createLovableAiGatewayProvider(getKey());
    const model = provider("google/gemini-2.5-flash");

    const systemPrompt = `You are a UK property investment surveyor. Analyse the property photos and listing.
Return STRICT JSON ONLY (no prose, no markdown) matching:
{
  "conditionScore": number 0-10,
  "items": [{"area":"kitchen|bathroom|roof|windows|electrics|heating|external|garden|decor|structural","issue":"...","severity":"low|medium|high","estimateGbp":number}],
  "summary": "2-3 sentence condition summary",
  "negotiationAngles": ["bullet leverage points the buyer can take to the agent"]
}`;

    const content: any[] = [
      { type: "text", text: `Listing: ${prop.address}\nType: ${prop.property_type ?? "?"}\nBeds: ${prop.beds ?? "?"}\nEPC: ${prop.epc_rate ?? "?"}\nAsking: £${prop.asking_price_gbp ?? "?"}\n\nPhotos to assess: ${photoUrls.length}` },
      ...photoUrls.map((url) => ({ type: "image", image: url })),
    ];

    let findings: any;
    try {
      const { text } = await generateText({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
      });
      const parsed = parseJsonBlock(text);
      findings = FindingsSchema.parse(parsed);
    } catch (e: any) {
      throw new Error("AI analysis failed: " + e.message);
    }

    // upsert analysis row
    const { data: existing } = await context.supabase
      .from("analyses").select("id").eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    if (existing) {
      await context.supabase.from("analyses").update({
        ai_notes: findings, ai_used_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await context.supabase.from("analyses").insert({
        user_id: context.userId, property_id: data.propertyId,
        ai_notes: findings, ai_used_at: new Date().toISOString(),
      });
    }

    return findings;
  });

export const getAIAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ propertyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("analyses").select("ai_notes, ai_used_at")
      .eq("property_id", data.propertyId).eq("user_id", context.userId).maybeSingle();
    return row ?? null;
  });