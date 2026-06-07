import { createFileRoute } from "@tanstack/react-router";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const Route = createFileRoute("/api/deal-pdf/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getPublicDealSheet } = await import("@/lib/deal-sheets.functions");
        const sheet = await getPublicDealSheet({ data: { token: params.token } });
        if (!sheet) return new Response("Not found", { status: 404 });
        const snap: any = sheet.snapshot;
        const prop = snap.property;
        const a = snap.analysis;
        const ai = snap.ai;
        const best = a.strategies.find((s: any) => s.key === a.bestStrategy);
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
        const write = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
          const size = opts.size ?? 11;
          if (y < 60) { page = pdf.addPage([595, 842]); y = 800; }
          page.drawText(text.slice(0, 110), {
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
        best?.numbers.forEach((n: any) => {
          const val = n.format === "gbp" ? `£${Math.round(n.value).toLocaleString()}`
            : n.format === "pct" ? `${(n.value * 100).toFixed(1)}%`
            : Math.round(n.value * 100) / 100;
          write(`  ${n.label}: ${val}`, { size: 10 });
        });
        y -= 10;

        write("STRATEGY COMPARISON", { size: 12, bold: true });
        a.strategies.forEach((s: any) => write(`  ${s.name}: ${s.dealScore}/100 — ${s.summary}`, { size: 10 }));
        y -= 10;

        write("NEGOTIATION LEVERAGE", { size: 12, bold: true });
        a.negotiation.forEach((n: any) => {
          write(`  • ${n.title} (-£${n.gbp_impact.toLocaleString()}, ${n.confidence})`, { size: 10, bold: true });
          write(`    ${n.description}`, { size: 9, color: [0.4, 0.4, 0.4] });
        });

        if (includeRisk && Array.isArray(a.riskFlags) && a.riskFlags.length) {
          y -= 10;
          write("RISK FLAGS", { size: 12, bold: true });
          a.riskFlags.forEach((f: any) => write(`  ⚠ ${f.label} — ${f.reason}`, { size: 9, color: [0.5, 0.3, 0.1] }));
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
          (ai.items ?? []).forEach((it: any) => {
            write(`  • [${it.severity}] ${it.area} — ${it.issue}: £${it.estimateGbp.toLocaleString()}`, { size: 10 });
          });
        }

        y -= 16;
        write(`Generated ${new Date(snap.generatedAt).toLocaleDateString("en-GB")} · Estimates only — not investment advice.`, { size: 8, color: [0.5, 0.5, 0.5] });

        const bytes = await pdf.save();
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="deal-sheet-${params.token.slice(0, 8)}.pdf"`,
          },
        });
      },
    },
  },
});