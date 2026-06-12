import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getRequestIp, lookupGeo } from "./request-meta.server";

const SubmitFeedbackSchema = z.object({
  propertyId: z.string().uuid().nullable(),
  sectionKey: z.string().max(60),
  sectionLabel: z.string().max(120),
  vote: z.enum(["up", "down"]),
  reasons: z.array(z.string().max(200)).max(10),
  note: z.string().max(1000).optional(),
  pagePath: z.string().max(500),
});

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitFeedbackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ip = getRequestIp();
    const geo = await lookupGeo(ip);

    const { error } = await context.supabase.from("feedback").insert({
      user_id: context.userId,
      property_id: data.propertyId,
      section_key: data.sectionKey,
      section_label: data.sectionLabel,
      vote: data.vote,
      reasons: data.reasons,
      note: data.note ?? null,
      page_path: data.pagePath,
      ip_address: ip,
      location_city: geo.city,
      location_country: geo.country,
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
