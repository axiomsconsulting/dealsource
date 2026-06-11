import { createFileRoute } from "@tanstack/react-router";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { fmtGBP, fmtPct } from "@/lib/format";
import { fmtHistoryDate } from "@/lib/analysis/price-history";

// The standard Helvetica fonts are encoded WinAnsi (Windows-1252) — drawText() THROWS on any
// character outside that set (e.g. "⚠", emoji, CJK). Property/AI-generated text is unpredictable,
// so every string reaching the PDF must be sanitised first or the whole download 500s.
const PDF_GLYPH_FALLBACKS: Record<string, string> = {
  "⚠": "!",
  "→": "->",
  "←": "<-",
  "✓": "v",
  "✗": "x",
  "★": "*",
  "🏠": "",
  "📍": "",
};
function pdfSafe(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const [glyph, fallback] of Object.entries(PDF_GLYPH_FALLBACKS))
    out = out.split(glyph).join(fallback);
  // WinAnsi covers Latin-1 (incl. £, ·, ", ') plus a handful of CP1252 punctuation in the 0x2018-0x2026 band.
  return out.replace(/[^\x20-\x7E\xA0-\xFF–—‘’‚“”„•…]/g, "");
}

const PAGE_SIZE: [number, number] = [595, 842];
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_SIZE[0] - MARGIN * 2;

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
          return new Response(
            "Could not generate this PDF — the deal sheet data may be incomplete.",
            { status: 500 },
          );
        }
      },
    },
  },
});

/** Greedy word-wrap: splits on existing newlines, then breaks each line at word boundaries so it
 *  fits within `maxWidth` at the given font/size — replaces the old `.slice(0, 110)` truncation. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of pdfSafe(text).split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

interface DocState {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

function newPage(state: DocState) {
  state.page = state.pdf.addPage(PAGE_SIZE);
  state.y = PAGE_SIZE[1] - MARGIN;
}

function ensureSpace(state: DocState, height: number) {
  if (state.y - height < MARGIN) newPage(state);
}

/** Draws word-wrapped text, breaking onto new pages as needed. */
function paragraph(
  state: DocState,
  text: string,
  opts: { size?: number; bold?: boolean; color?: [number, number, number]; maxWidth?: number } = {},
) {
  if (!text) return;
  const size = opts.size ?? 10;
  const f = opts.bold ? state.bold : state.font;
  const lineHeight = size + 4;
  const lines = wrapText(text, f, size, opts.maxWidth ?? CONTENT_WIDTH);
  for (const line of lines) {
    ensureSpace(state, lineHeight);
    state.page.drawText(line, {
      x: MARGIN,
      y: state.y,
      size,
      font: f,
      color: rgb(...(opts.color ?? [0.1, 0.1, 0.15])),
    });
    state.y -= lineHeight;
  }
}

function heading(state: DocState, text: string) {
  ensureSpace(state, 28);
  state.y -= 6;
  paragraph(state, text, { size: 13, bold: true });
  // underline
  ensureSpace(state, 4);
  state.page.drawLine({
    start: { x: MARGIN, y: state.y + 2 },
    end: { x: MARGIN + CONTENT_WIDTH, y: state.y + 2 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  state.y -= 4;
}

function gap(state: DocState, amount = 8) {
  state.y -= amount;
}

/** Two-column label/value row — used for stat grids (offer plan figures, key numbers, etc.). */
function keyValueRow(state: DocState, label: string, value: string) {
  ensureSpace(state, 15);
  state.page.drawText(pdfSafe(label), {
    x: MARGIN,
    y: state.y,
    size: 10,
    font: state.font,
    color: rgb(0.4, 0.4, 0.4),
  });
  const valueText = pdfSafe(value);
  const valueWidth = state.bold.widthOfTextAtSize(valueText, 10);
  state.page.drawText(valueText, {
    x: MARGIN + CONTENT_WIDTH - valueWidth,
    y: state.y,
    size: 10,
    font: state.bold,
    color: rgb(0.1, 0.1, 0.15),
  });
  state.y -= 15;
}

async function buildDealSheetPdf(sheet: any, token: string, origin: string) {
  const snap: any = sheet.snapshot;
  const prop = snap.property ?? {};
  const a = snap.analysis ?? {};
  const persona = snap.persona ?? null;
  const ai = snap.ai ?? null;
  const priceHistory: any[] = snap.priceHistory ?? [];
  const strategies = Array.isArray(a?.strategies) ? a.strategies : [];
  const best = strategies.find((s: any) => s.key === a.bestStrategy);
  const guidance = a.negotiationGuidance;
  const negotiation: any[] = Array.isArray(a.negotiation) ? a.negotiation : [];
  const redact = (sheet as any).redact;
  const hideAddress = (sheet as any).hide_address ?? false;
  const hidePhotos = (sheet as any).hide_photos ?? false;
  const includeRefurb = (sheet as any).include_refurb_breakdown ?? true;
  const includeRisk = (sheet as any).include_risk_flags ?? true;
  const signals = prop.signals ?? {};
  const marketData = prop.market_data ?? null;
  const epcData = prop.epc_data ?? null;
  const allPhotos: any[] = (sheet as any).photos ?? [];
  const visiblePhotos = allPhotos.filter((p: any) => (redact ? !p.is_exterior : true));
  const photos = visiblePhotos.filter((p: any) => !p.is_floor_plan);
  const floorPlans = visiblePhotos.filter((p: any) => p.is_floor_plan);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const state: DocState = {
    pdf,
    page: pdf.addPage(PAGE_SIZE),
    y: PAGE_SIZE[1] - MARGIN,
    font,
    bold,
  };

  // Best-effort logo — a missing/broken logo shouldn't fail the whole PDF.
  try {
    const res = await fetch(`${origin}/omnispace-logo.png`);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const logoImage = await pdf.embedPng(bytes);
      const maxWidth = 160;
      const scale = Math.min(1, maxWidth / logoImage.width);
      const dims = { width: logoImage.width * scale, height: logoImage.height * scale };
      state.page.drawImage(logoImage, {
        x: MARGIN,
        y: state.y - dims.height + 10,
        width: dims.width,
        height: dims.height,
      });
      state.y -= dims.height + 10;
    }
  } catch {
    // logo is decorative — proceed without it
  }

  paragraph(state, "INVESTMENT SUMMARY — CONFIDENTIAL", { size: 9, color: [0.4, 0.4, 0.4] });
  gap(state, 4);

  const title = hideAddress
    ? `Property in ${prop.postcode?.split(" ")[0] ?? prop.city ?? "the area"} · ${prop.property_type ?? ""}`
    : (prop.address ?? "Property");
  paragraph(state, title, { size: 18, bold: true });
  gap(state, 2);
  paragraph(
    state,
    `${prop.beds ?? "?"} bed · ${prop.baths ?? "?"} bath · ${prop.property_type ?? ""} · EPC ${prop.epc_rate ?? "?"} · ${prop.tenure ?? ""}${prop.area_sqm ? ` · ${Math.round(prop.area_sqm)} m²` : ""}`,
    { size: 10, color: [0.4, 0.4, 0.4] },
  );
  if (prop.article4_status === "inside")
    paragraph(
      state,
      "Inside an Article 4 direction area — HMO permitted development rights removed.",
      { size: 9, color: [0.6, 0.4, 0.1] },
    );
  gap(state, 10);

  // ── Headline ──
  heading(state, "Headline");
  if (a.overallScore != null) keyValueRow(state, "Deal score", `${a.overallScore}/100`);
  if (prop.asking_price_gbp != null)
    keyValueRow(state, "Asking price", fmtGBP(prop.asking_price_gbp));
  if (best) keyValueRow(state, "Best strategy", `${best.name} (${best.dealScore}/100)`);
  if (Array.isArray(a.dealIndicators)) {
    for (const ind of a.dealIndicators) keyValueRow(state, ind.label, ind.value);
  }
  if (best?.summary) {
    gap(state, 4);
    paragraph(state, best.summary, { size: 10, color: [0.3, 0.3, 0.3] });
  }
  gap(state, 10);

  // ── Investor criteria ──
  if (persona) {
    heading(state, "Investor criteria applied");
    keyValueRow(state, "Profile", persona.name ?? "—");
    if (persona.investor_type)
      keyValueRow(state, "Investor type", String(persona.investor_type).replace(/_/g, " "));
    if (persona.cash_available_gbp != null)
      keyValueRow(state, "Cash available", fmtGBP(persona.cash_available_gbp));
    if (persona.target_rent_gbp != null)
      keyValueRow(state, "Target rent", `${fmtGBP(persona.target_rent_gbp)}/mo`);
    if (persona.target_offer_gbp != null)
      keyValueRow(state, "Target offer", fmtGBP(persona.target_offer_gbp));
    if (persona.max_offer_gbp != null)
      keyValueRow(state, "Max offer", fmtGBP(persona.max_offer_gbp));
    if (persona.refurb_buffer_gbp != null)
      keyValueRow(state, "Refurb buffer", fmtGBP(persona.refurb_buffer_gbp));
    if (persona.min_beds != null || persona.max_beds != null)
      keyValueRow(state, "Bedroom range", `${persona.min_beds ?? "–"}–${persona.max_beds ?? "–"}`);
    if (persona.min_epc) keyValueRow(state, "Min. EPC", persona.min_epc);
    gap(state, 4);
    if (a.personaMatch?.pass) {
      paragraph(state, "This property fits the investor criteria above.", {
        size: 10,
        color: [0.05, 0.45, 0.25],
      });
    } else {
      paragraph(state, "This property does not fully fit the criteria above:", {
        size: 10,
        color: [0.6, 0.4, 0.1],
      });
      for (const r of a.personaMatch?.reasons ?? [])
        paragraph(state, `• ${r}`, { size: 9, color: [0.4, 0.4, 0.4] });
    }
    gap(state, 10);
  }

  // ── Offer plan ──
  if (guidance) {
    heading(state, "Offer plan");
    keyValueRow(state, "Asking price", fmtGBP(guidance.askingPrice));
    keyValueRow(state, "Opening offer", fmtGBP(guidance.openingOffer));
    keyValueRow(state, "Target offer", fmtGBP(guidance.targetOffer));
    keyValueRow(state, "Walk-away ceiling", fmtGBP(guidance.walkAwayOffer));
    if (guidance.equityPlan?.maxOfferForTargetEquity != null)
      keyValueRow(
        state,
        "Equity-target ceiling",
        fmtGBP(guidance.equityPlan.maxOfferForTargetEquity),
      );
    keyValueRow(state, "Price band", guidance.priceBand);
    keyValueRow(state, "Negotiation stance", guidance.stance.replace(/-/g, " "));
    keyValueRow(state, "Max opening discount", fmtPct(guidance.maxOpeningDiscountPct));
    if (guidance.epcToCCost != null)
      keyValueRow(state, "EPC-to-C cost (in walk-away)", fmtGBP(guidance.epcToCCost));
    for (const w of guidance.warnings ?? []) {
      gap(state, 2);
      paragraph(state, `• ${w}`, { size: 9, color: [0.6, 0.4, 0.1] });
    }
    gap(state, 10);
  }

  // ── Negotiation leverage ──
  if (negotiation.length > 0) {
    heading(state, "Why this price — negotiation leverage");
    for (const n of negotiation) {
      paragraph(state, `${n.title}  —  -${fmtGBP(n.gbp_impact)}  (${n.confidence} confidence)`, {
        size: 10,
        bold: true,
      });
      paragraph(state, n.description, { size: 9, color: [0.4, 0.4, 0.4] });
      gap(state, 4);
    }
    keyValueRow(state, "Total weighted leverage", `-${fmtGBP(a.negotiationTotal ?? 0)}`);
    gap(state, 10);
  }

  // ── Market signals ──
  heading(state, "Market signals");
  keyValueRow(
    state,
    "Price reductions",
    signals.priceReductions != null ? `${signals.priceReductions} reduction(s)` : "No data",
  );
  keyValueRow(
    state,
    "Back on market",
    signals.backOnMarket != null
      ? Number(signals.backOnMarket) > 0
        ? `${signals.backOnMarket}x relisted`
        : "Not relisted"
      : "No data",
  );
  keyValueRow(
    state,
    "Days on market",
    signals.daysOnMarket != null ? String(signals.daysOnMarket) : "No data",
  );
  if (signals.lastSold)
    keyValueRow(
      state,
      "Last sold",
      `${fmtGBP(Number(signals.lastSold.value))} (${signals.lastSold.date})`,
    );
  keyValueRow(
    state,
    "EPC",
    (epcData?.currentRating ?? prop.epc_rate)
      ? `Band ${epcData?.currentRating ?? prop.epc_rate}${epcData?.currentScore ? ` (${epcData.currentScore} SAP)` : ""}`
      : "Not available",
  );
  if (priceHistory.length >= 2) {
    gap(state, 4);
    paragraph(state, "Price history", { size: 10, bold: true });
    for (const h of priceHistory) {
      const change =
        h.changeFromPrevious != null && h.changeFromPrevious !== 0
          ? ` (${h.changeFromPrevious < 0 ? "-" : "+"}${fmtGBP(Math.abs(h.changeFromPrevious))})`
          : "";
      keyValueRow(state, fmtHistoryDate(h.date), `${fmtGBP(h.value)}${change}`);
    }
  }
  if (marketData?.areaStats || marketData?.soldComparables?.length > 0) {
    gap(state, 4);
    paragraph(state, "Area comparables", { size: 10, bold: true });
    const areaPrice =
      marketData.areaStats?.medianSoldPrice ?? marketData.areaStats?.averageSoldPrice;
    if (areaPrice != null)
      keyValueRow(state, marketData.areaStats?.periodLabel ?? "Area sold price", fmtGBP(areaPrice));
    if (marketData.areaStats?.sampleSize != null)
      keyValueRow(state, "Sample size", `${marketData.areaStats.sampleSize} sales`);
    for (const c of (marketData.soldComparables ?? []).slice(0, 6)) {
      keyValueRow(
        state,
        `${c.address ?? "Comparable"}${c.date ? ` (${c.date})` : ""}`,
        c.price != null ? fmtGBP(c.price) : "—",
      );
    }
  }
  gap(state, 10);

  // ── Strategy comparison ──
  if (strategies.length > 0) {
    heading(state, "Strategy comparison");
    if (best?.numbers?.length > 0) {
      paragraph(state, `${best.name} — recommended`, { size: 11, bold: true });
      paragraph(state, best.summary ?? "", { size: 9, color: [0.4, 0.4, 0.4] });
      for (const n of best.numbers) {
        const val =
          n.format === "gbp"
            ? fmtGBP(n.value)
            : n.format === "pct"
              ? fmtPct(n.value)
              : String(Math.round((n.value ?? 0) * 100) / 100);
        keyValueRow(state, n.label, val);
      }
      gap(state, 6);
    }
    paragraph(state, "All strategies considered", { size: 10, bold: true });
    for (const s of strategies) {
      keyValueRow(state, s.name, `${s.dealScore}/100${s.feasible ? "" : " (not feasible)"}`);
      paragraph(state, s.summary ?? "", { size: 9, color: [0.4, 0.4, 0.4] });
    }
    gap(state, 10);
  }

  // ── Condition & refurb ──
  if (ai?.summary || prop.refurb_estimate || a.effectiveInputs?.refurb_cost > 0) {
    heading(state, "Condition & refurbishment");
    if (ai?.summary) {
      paragraph(state, "AI condition report", { size: 10, bold: true });
      paragraph(state, ai.summary, { size: 9, color: [0.4, 0.4, 0.4] });
      for (const it of ai.items ?? []) {
        keyValueRow(state, `[${it.severity}] ${it.area}: ${it.issue}`, fmtGBP(it.estimateGbp));
      }
      gap(state, 6);
    }
    if (a.effectiveInputs?.refurb_cost > 0) {
      keyValueRow(state, "Estimated refurb capex", fmtGBP(a.effectiveInputs.refurb_cost));
      if (includeRefurb && prop.refurb_estimate?.lines?.length > 0) {
        for (const line of prop.refurb_estimate.lines)
          keyValueRow(state, `  ${line.label}`, fmtGBP(line.amount));
      } else if (includeRefurb) {
        paragraph(state, "Algorithmic estimate based on property type, size and condition.", {
          size: 9,
          color: [0.4, 0.4, 0.4],
        });
      }
    }
    gap(state, 10);
  }

  // ── Risk flags ──
  if (includeRisk && Array.isArray(a.riskFlags) && a.riskFlags.length) {
    heading(state, "Risk flags");
    for (const f of a.riskFlags) {
      paragraph(state, f.label, {
        size: 10,
        bold: true,
        color: f.severity === "red" ? [0.6, 0.1, 0.1] : [0.6, 0.4, 0.1],
      });
      paragraph(state, f.reason, { size: 9, color: [0.4, 0.4, 0.4] });
    }
    gap(state, 10);
  }

  // ── Photos ──
  if (!hidePhotos && (photos.length > 0 || floorPlans.length > 0)) {
    newPage(state);
    heading(state, "Photos");
    await drawPhotoGrid(state, photos.slice(0, 6));
    if (floorPlans.length > 0) {
      gap(state, 10);
      paragraph(state, "Floor plans", { size: 11, bold: true });
      await drawPhotoGrid(state, floorPlans.slice(0, 2));
    }
  }

  // ── Footer / page numbers ──
  const pages = pdf.getPages();
  const generatedLabel = `Generated ${new Date(snap.generatedAt).toLocaleDateString("en-GB")} · Estimates only — not investment advice.`;
  pages.forEach((p, i) => {
    p.drawText(pdfSafe(generatedLabel), {
      x: MARGIN,
      y: 24,
      size: 7,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });
    const pageLabel = `Page ${i + 1} of ${pages.length}`;
    const w = font.widthOfTextAtSize(pageLabel, 7);
    p.drawText(pageLabel, {
      x: PAGE_SIZE[0] - MARGIN - w,
      y: 24,
      size: 7,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });
  });

  const bytes = await pdf.save();
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="deal-sheet-${token.slice(0, 8)}.pdf"`,
    },
  });
}

/** Fetches and embeds a signed photo URL, trying JPG then PNG — skips photos that fail to embed
 *  rather than failing the whole PDF (signed URLs/content can be unpredictable). */
async function fetchEmbeddable(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("png")) return await pdf.embedPng(bytes);
    if (contentType.includes("jpeg") || contentType.includes("jpg"))
      return await pdf.embedJpg(bytes);
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return await pdf.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

/** Lays out a 2-column grid of photos, each scaled to fit a fixed-height box, paginating as needed. */
async function drawPhotoGrid(state: DocState, items: any[]) {
  const cols = 2;
  const gapPx = 12;
  const boxWidth = (CONTENT_WIDTH - gapPx * (cols - 1)) / cols;
  const boxHeight = 160;
  for (let i = 0; i < items.length; i++) {
    const image = await fetchEmbeddable(state.pdf, items[i].url);
    if (!image) continue;
    const col = i % cols;
    if (col === 0) ensureSpace(state, boxHeight + gapPx);
    const x = MARGIN + col * (boxWidth + gapPx);
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    state.page.drawImage(image, {
      x: x + (boxWidth - w) / 2,
      y: state.y - boxHeight + (boxHeight - h) / 2,
      width: w,
      height: h,
    });
    if (col === cols - 1 || i === items.length - 1) state.y -= boxHeight + gapPx;
  }
}
