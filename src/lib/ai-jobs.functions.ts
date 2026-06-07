import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const startLibraryAIJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ force: z.boolean().default(false), limit: z.number().int().min(1).max(200).default(100) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Pick properties to analyse
    const { data: props } = await context.supabase
      .from("properties").select("id").eq("user_id", context.userId)
      .order("created_at", { ascending: false }).limit(data.limit);
    if (!props?.length) throw new Error("No properties to analyse");

    const { data: existing } = await context.supabase
      .from("analyses").select("property_id, ai_payload").eq("user_id", context.userId);
    const have = new Set((existing ?? []).filter((r: any) => r.ai_payload).map((r: any) => r.property_id));
    const todo = data.force ? props : props.filter((p: any) => !have.has(p.id));
    if (!todo.length) throw new Error("All selected properties already analysed. Tick 'Re-run' to force.");

    const { data: job, error } = await context.supabase
      .from("ai_jobs").insert({
        user_id: context.userId,
        kind: "library_analysis",
        total: todo.length,
        completed: 0,
        errors: 0,
        status: "running",
        property_ids: todo.map((p: any) => p.id) as any,
      }).select("*").single();
    if (error) throw new Error(error.message);

    // Fire-and-forget background loop (await first so client gets job id back)
    (async () => {
      const { runFullAnalysisForJob } = await import("./ai.functions");
      for (const p of todo) {
        try {
          await runFullAnalysisForJob(context, p.id);
          await context.supabase.from("ai_jobs").update({
            completed: (await getCount(context, job.id, "completed")) + 1,
            last_property_id: p.id,
          }).eq("id", job.id);
        } catch (e: any) {
          await context.supabase.from("ai_jobs").update({
            errors: (await getCount(context, job.id, "errors")) + 1,
            last_property_id: p.id,
            last_error: String(e?.message ?? e).slice(0, 500),
          }).eq("id", job.id);
        }
      }
      await context.supabase.from("ai_jobs").update({ status: "done" }).eq("id", job.id);
    })().catch(() => {});

    return { jobId: job.id, total: todo.length };
  });

async function getCount(ctx: any, jobId: string, field: "completed" | "errors"): Promise<number> {
  const { data } = await ctx.supabase.from("ai_jobs").select(field).eq("id", jobId).maybeSingle();
  return (data?.[field] as number) ?? 0;
}

export const getAIJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("ai_jobs").select("*").eq("id", data.jobId).eq("user_id", context.userId).maybeSingle();
    return row ?? null;
  });

export const cancelAIJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase.from("ai_jobs")
      .update({ status: "cancelled" })
      .eq("id", data.jobId).eq("user_id", context.userId).eq("status", "running");
    return { ok: true };
  });