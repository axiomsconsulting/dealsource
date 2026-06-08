import { createFileRoute } from "@tanstack/react-router";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// The standard Helvetica fonts are encoded WinAnsi (Windows-1252) — drawText() THROWS on any
// character outside that set (e.g. "⚠", emoji, CJK). Property/AI-generated text is unpredictable,
// so every string reaching the PDF must be sanitised first or the whole download 500s.
const PDF_GLYPH_FALLBACKS: Record<string, string> = {
  "⚠": "!", "→": "->", "←": "<-", "✓": "v", "✗": "x", "★": "*", "🏠": "", "📍": "",
};
function pdfSafe(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const [glyph, fallback] of Object.entries(PDF_GLYPH_FALLBACKS)) out = out.split(glyph).join(fallback);
  // WinAnsi covers Latin-1 (incl. £, ·, ", ') plus a handful of CP1252 punctuation in the 0x2018-0x2026 band.
  return out.replace(/[^\x20-\x7E\xA0-\xFF–—‘’‚“”„•…]/g, "");
}

export const Route = createFileRoute("/api/deal-pdf/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { getPublicDealSheet } = await import("@/lib/deal-sheets.functions");
        const sheet = await getPublicDealSheet({ data: { token: params.token } });
        if (!sheet) return new Response("Not found", { status: 404 });
        try {
          return await buildDealSheetPdf(sheet, params.token, new URL(request.url).origin);
        } catch (err) {
          console.error("deal-pdf generation failed", err);
          return new Response("Could not generate this PDF — the deal sheet data may be incomplete.", { status: 500 });
        }
      },
    },
  },
});

async function buildDealSheetPdf(sheet: any, token: string, origin: string) {
  const snap: any = sheet.snapshot;
  const prop = snap.property;
  const a = snap.analysis;
  const ai = snap.ai;
  const strategies = Array.isArray(a?.strategies) ? a.strategies : [];
  const best = strategies.find((s: any) => s.key === a.bestStrategy);
  const redact = (sheet as any).redact;
  const hideAddress = (sheet as any).hide_address ?? false;
  const hidePhotos = (sheet as any).hide_photos ?? false;
  const includeRefurb = (sheet as any).include_refurb_breakdown ?? true;
  const includeRisk = (sheet as any).include_risk_flags ?? true;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const margin = 40;

  // Wide Omnispace Estates / Deal Negotiator logo, served as a static asset — fetched from the
  // request's own origin so this works identically in dev and prod without filesystem assumptions.
  // Best-effort: a missing/broken logo shouldn't fail the whole PDF.
  let logoDims: { width: number; height: number } | null = null;
  let logoImage: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try {
    const res = await fetch(`${origin}/omnispace-logo.png`);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      logoImage = await pdf.embedPng(bytes);
      const maxWidth = 180;
      const scale = Math.min(1, maxWidth / logoImage.width);
      logoDims = { width: logoImage.width * scale, height: logoImage.height * scale };
    }
  } catch {
    // logo is decorative — proceed without it
  }
  if (logoImage && logoDims) {
    page.drawImage(logoImage, { x: margin, y: y - logoDims.height + 10, width: logoDims.width, height: logoDims.height });
    y -= logoDims.height + 6;
  }
  const write = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 11;
    if (y < 60) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawText(pdfSafe(text).slice(0, 110), {
      x: margin, y, size, font: opts.bold ? bold : font,
      color: rgb(...(opts.color ?? [0.1, 0.1, 0.15])),
    });
    y -= size + 6;
  };

  const title = (hideAddress || redact)
    ? `Property in ${prop.postcode?.split(" ")[0] ?? prop.city ?? "the area"} · ${prop.property_type ?? ""}`
    : prop.address;
  write("INVESTMENT DEAL SHEET", { size: 10, color: [0.4, 0.4, 0.4] });
  write(title, { size: 18, bold: true });
  y -= 4;
  write(`${prop.beds ?? "?"} bed · ${prop.property_type ?? ""} · EPC ${prop.epc_rate ?? "?"} · ${prop.tenure ?? ""}`, { size: 10, color: [0.4, 0.4, 0.4] });
  y -= 10;

  write(`Asking price: £${(prop.asking_price_gbp ?? 0).toLocaleString()}`, { size: 12, bold: true });
  write(`Deal score: ${a.overallScore}/100`, { size: 12, bold: true });
  write(`Best strategy: ${best?.name} (${best?.dealScore}/100)`, { size: 12, bold: true });
  y -= 10;

  write(best?.summary ?? "", { size: 11 });
  y -= 6;
  write("KEY NUMBERS", { size: 12, bold: true });
  (best?.numbers ?? []).forEach((n: any) => {
    const val = n.format === "gbp" ? `£${Math.round(n.value ?? 0).toLocaleString()}`
      : n.format === "pct" ? `${((n.value ?? 0) * 100).toFixed(1)}%`
      : Math.round((n.value ?? 0) * 100) / 100;
    write(`  ${n.label}: ${val}`, { size: 10 });
  });
  y -= 10;

  write("STRATEGY COMPARISON", { size: 12, bold: true });
  strategies.forEach((s: any) => write(`  ${s.name}: ${s.dealScore}/100 - ${s.summary}`, { size: 10 }));
  y -= 10;

  write("NEGOTIATION LEVERAGE", { size: 12, bold: true });
  (Array.isArray(a.negotiation) ? a.negotiation : []).forEach((n: any) => {
    write(`  - ${n.title} (-£${Math.round(n.gbp_impact ?? 0).toLocaleString()}, ${n.confidence})`, { size: 10, bold: true });
    write(`    ${n.description}`, { size: 9, color: [0.4, 0.4, 0.4] });
  });

  if (includeRisk && Array.isArray(a.riskFlags) && a.riskFlags.length) {
    y -= 10;
    write("RISK FLAGS", { size: 12, bold: true });
    a.riskFlags.forEach((f: any) => write(`  [!] ${f.label} - ${f.reason}`, { size: 9, color: [0.5, 0.3, 0.1] }));
  }

  if (includeRefurb && a.effectiveInputs?.refurb_cost) {
    y -= 10;
    write("REFURB BUDGET", { size: 12, bold: true });
    write(`  Estimated total: £${Math.round(a.effectiveInputs.refurb_cost).toLocaleString()}`, { size: 10 });
  }

  if (ai && !hidePhotos) {
    y -= 10;
    write("AI CONDITION REPORT", { size: 12, bold: true });
    write(ai.summary ?? "", { size: 10 });
    (Array.isArray(ai.items) ? ai.items : []).forEach((it: any) => {
      write(`  - [${it.severity}] ${it.area} - ${it.issue}: £${Math.round(it.estimateGbp ?? 0).toLocaleString()}`, { size: 10 });
    });
  }

  y -= 16;
  write(`Generated ${new Date(snap.generatedAt).toLocaleDateString("en-GB")} · Estimates only — not investment advice.`, { size: 8, color: [0.5, 0.5, 0.5] });

  const bytes = await pdf.save();
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="deal-sheet-${token.slice(0, 8)}.pdf"`,
    },
  });
}