import type { PropertyInput } from "./types";

export interface SurveyIssue {
  key: "structural" | "roof" | "asbestos" | "non_standard_construction";
  title: string;
  /** "flagged" = the data itself points at this; "watch" = plausible but unconfirmed; "routine" =
   *  worth checking on every purchase regardless of what the listing says. */
  signal: "flagged" | "watch" | "routine";
  evidence?: string;
  surveyorBrief: string;
  builderBrief: string;
  markdownNote: string;
  /** Recommended price-markdown range if the issue is confirmed, as a fraction of asking price. */
  markdownLowPct: number;
  markdownHighPct: number;
}

// Recognised non-traditional / PRC (Pre-cast Reinforced Concrete) and system-built methods —
// these are the designated types that materially affect mainstream mortgageability and resale,
// not just condition. Matched against the EPC register's own construction descriptions, which is
// the one source we have that's grounded in an actual assessor's inspection rather than a guess.
const NON_STANDARD_PATTERNS: RegExp[] = [
  /\bsystem[\s-]?built\b/i,
  /\btimber[\s-]?frame\b/i,
  /\bsteel[\s-]?frame\b/i,
  /\bno[\s-]?fines\b/i,
  /\bprecast\s*(reinforced)?\s*concrete\b/i,
  /\bPRC\b/,
  /\bairey\b/i,
  /\bcornish\s*unit/i,
  /\bwimpey\b/i,
  /\breema\b/i,
  /\borlit\b/i,
  /\beasiform\b/i,
  /\bunity\s*(house|type)?\b/i,
  /\bbisf\b/i,
  /\bnon[\s-]?traditional\b/i,
  /\bconcrete\s*(panel|clad|construction)\b/i,
];

// Construction-era language that raises the odds of asbestos-containing materials (ACMs) — used
// in the UK in textured coatings, soffits/fascias, garage roofs, pipe lagging and floor tiles
// right up to the 1999/2000 ban. We don't have a structured construction-age field, so we look
// for era language the EPC register or listing itself surfaces.
const PRE_2000_ERA_PATTERNS: RegExp[] = [
  /\b(18\d{2}|19[0-8]\d|199[0-9])\b/,
  /victorian|edwardian|georgian/i,
  /pre[\s-]?(19)?(80|war)/i,
  /inter[\s-]?war/i,
  /\b1990s\b/i,
];

function epcTextBlob(prop: PropertyInput): { blob: string; wallDesc?: string; roofDesc?: string; roofEff?: string | null } {
  const epc: any = (prop as any).epc_data ?? null;
  if (!epc) return { blob: "" };
  const elements: any[] = Array.isArray(epc.elements) ? epc.elements : [];
  const wall = elements.find((e) => e?.key === "walls");
  const roof = elements.find((e) => e?.key === "roofs");
  const blob = [epc.propertyType, epc.builtForm, wall?.description, roof?.description, epc.lodgementDate, epc.inspectionDate]
    .filter(Boolean)
    .join(" — ");
  return { blob, wallDesc: wall?.description ?? undefined, roofDesc: roof?.description ?? undefined, roofEff: roof?.energyEff ?? null };
}

/** Pure, persona-independent survey/condition leverage: what to brief the surveyor and builder to
 *  dig into, and what a confirmed finding is realistically worth off the price — both as a repair
 *  cost and as a resalability/mortgageability discount that outlasts the repair itself. */
export function buildSurveyStrategy(prop: PropertyInput): SurveyIssue[] {
  const { blob, wallDesc, roofDesc, roofEff } = epcTextBlob(prop);
  const nonStandardHit = NON_STANDARD_PATTERNS.find((re) => re.test(blob));
  const eraHit = PRE_2000_ERA_PATTERNS.find((re) => re.test(blob));

  const issues: SurveyIssue[] = [];

  // Non-standard construction — found from the EPC register's own construction description.
  issues.push({
    key: "non_standard_construction",
    title: "Non-standard / PRC construction",
    signal: nonStandardHit ? "flagged" : "watch",
    evidence: nonStandardHit
      ? `EPC register construction details ("${wallDesc ?? blob}") match a recognised non-traditional/PRC pattern — treat as live until the surveyor formally rules it out.`
      : wallDesc
        ? `EPC register describes the walls as "${wallDesc}" — no recognised non-standard keyword matched, but EPC wall descriptions are often generic (e.g. "cavity wall, filled"); that alone doesn't rule out a non-traditional method underneath.`
        : "No EPC construction description on file — confirm the build method before relying on the listing's own description of it.",
    surveyorBrief: "Ask the Level 3 (RICS Building Survey) surveyor to formally state the construction method — brick/block cavity vs. system-built, PRC, timber/steel frame, or no-fines concrete — and to say explicitly whether it appears on the PRC Homes / non-traditional designated list (BRE/PRC certification needed) or the relevant lender's non-standard construction list. This single line drives both your mortgage options and the next buyer's.",
    builderBrief: "If the type is ambiguous from outside (render hides a lot), ask the builder to open a small inspection point in an inconspicuous spot to confirm the wall makeup before you commit to a refurb spec — system-built and PRC properties often need entirely different repair methods (and materials) to traditional brick.",
    markdownNote: "Confirmed non-standard/PRC construction without valid repair certification materially shrinks the buyer pool — many mainstream lenders decline outright, pushing it to cash buyers or specialist (often higher-rate) mortgages. That's a structural discount on resale value, independent of the property's actual condition, and should be reflected in the price now rather than discovered (and re-negotiated) at your own sale.",
    markdownLowPct: 0.05,
    markdownHighPct: 0.15,
  });

  // Structural — always worth a dedicated brief; not derivable from EPC, so always "routine".
  issues.push({
    key: "structural",
    title: "Structural movement & foundations",
    signal: "routine",
    surveyorBrief: "Ask for an explicit written opinion (not just a tick-box) on cracking, bowing walls, or a bridged/missing damp-proof course, and — critically — whether any movement looks historic (decorated/pointed over, no fresh cracking) or live/progressive. A Level 3 report should grade severity and say plainly whether it warrants a structural engineer's inspection before exchange.",
    builderBrief: "Walk the builder around every external elevation and ask them to flag anything they'd want priced and resolved before any other works start — underpinning, wall-tie replacement or lateral restraint work reframes the entire refurb budget and sequencing, so you need that number before you finalise your offer, not after.",
    markdownNote: "Confirmed live movement justifies a markdown that covers at minimum the structural engineer's report plus the remedial works quote — and realistically a margin on top, because disclosed structural history (even fully repaired, with certification) is something buyers, their surveyors, their lenders and their insurers all discount on resale.",
    markdownLowPct: 0.03,
    markdownHighPct: 0.10,
  });

  // Roof — use the EPC's own roof description/rating where we have it.
  issues.push({
    key: "roof",
    title: "Roof condition & remaining life",
    signal: roofDesc ? "flagged" : "routine",
    evidence: roofDesc
      ? `EPC register roof description: "${roofDesc}"${roofEff ? ` — assessed thermal performance: ${roofEff}` : ""}. Use this as your opening reference point with the surveyor, not the final word — EPC assessments describe insulation, not structural condition.`
      : undefined,
    surveyorBrief: "Push the surveyor past \"satisfactory for its age\" — ask them to put a number on remaining roof life in years, and to specifically check valleys, flashings, verges and any flat-roof sections (these are where expensive failures start and are easiest to gloss over from ground level or a quick loft-hatch look).",
    builderBrief: "Get a fixed quote for full re-covering (not a patch-repair estimate) so you have a hard, comparable number to negotiate with even if the surveyor's verdict is \"adequate for now\" — roofs called adequate at purchase are very often replaced within a few years regardless.",
    markdownNote: "A roof realistically needing replacement within 5 years is a like-for-like capex item — negotiate it pound-for-pound off the price using the builder's fixed quote, not as a vague \"general condition\" allowance that's easy for the agent to wave away.",
    markdownLowPct: 0.02,
    markdownHighPct: 0.06,
  });

  // Asbestos — flagged where the EPC/listing language suggests a pre-2000 build/refurb era.
  issues.push({
    key: "asbestos",
    title: "Asbestos-containing materials (ACMs)",
    signal: eraHit ? "flagged" : "watch",
    evidence: eraHit
      ? `Construction-era language in the EPC/listing data ("${blob}") suggests a build period when ACMs (textured coatings, soffits/fascias, garage and outbuilding roofs, pipe lagging, floor tiles) were in routine use — assume present until a specialist survey says otherwise.`
      : "No construction-era signal available from the data on file — note that any property built or significantly altered before the 1999/2000 ACM ban can contain them, so this is worth checking regardless of what the listing implies.",
    surveyorBrief: "A standard Level 3 survey only visually flags *suspected* ACMs and will recommend a specialist follow-up — so get specific: ask the surveyor to list every location they suspect (garage/outbuilding roofs, soffits and fascias, textured ceiling coatings, airing-cupboard linings, old pipe lagging, vinyl floor tiles), so you can commission a targeted refurbishment & demolition (R&D) asbestos survey on exactly those areas before exchange rather than a vague whole-house caveat.",
    builderBrief: "Brief the builder to price the refurb assuming any suspected-ACM areas they'll be disturbing — stripping ceilings, demolishing outbuildings, lifting floor coverings — will need licensed removal. Get that contingency written into their quote up front; asbestos finds mid-refurb are where budgets and timelines blow out.",
    markdownNote: "Confirmed ACMs in areas your refurb needs to disturb justify a markdown covering licensed removal/encapsulation (commonly £2k–£8k+ depending on extent and access) — and where it touches habitable rooms, factor in the resale stigma too: buyers' conveyancers now routinely ask whether an asbestos register exists, and a disclosed entry depresses the next sale independent of the remediation having been done properly.",
    markdownLowPct: 0.01,
    markdownHighPct: 0.05,
  });

  return issues;
}
