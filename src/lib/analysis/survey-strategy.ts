import type { NegotiationPoint } from "./types";
import type { PropertyInput } from "./types";

export type SurveyIssueKey =
  | "structural" | "roof" | "asbestos" | "non_standard_construction"
  | "damp" | "timber_decay" | "windows_joinery" | "drainage_rainwater"
  | "electrics_plumbing" | "insulation_energy" | "japanese_knotweed" | "external_grounds";

export type SurveySeverity = "low" | "medium" | "high";

/** A confirmed survey finding for one issue, as logged by the user against `SurveyIssue.key` —
 *  `severity` selects where on the issue's `markdownLowPct..markdownHighPct` range the
 *  resulting negotiation leverage sits (low = bottom of range, high = top). */
export interface SurveyFindingState {
  active: boolean;
  severity: SurveySeverity;
  note?: string;
}

export type SurveyFindings = Record<string, SurveyFindingState>;

export interface SurveyIssue {
  key: SurveyIssueKey;
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

// Some cached certificates (Welsh ones, mainly) shape element `description` as `{ value, language }`
// rather than a plain string — coerce defensively so the regex blob and any rendered evidence
// text never end up with a literal "[object Object]" in them.
function descriptionText(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof (raw as any).value === "string") return (raw as any).value;
  return undefined;
}

function epcTextBlob(prop: PropertyInput): { blob: string; wallDesc?: string; roofDesc?: string; roofEff?: string | null; windowDesc?: string } {
  const epc: any = (prop as any).epc_data ?? null;
  if (!epc) return { blob: "" };
  const elements: any[] = Array.isArray(epc.elements) ? epc.elements : [];
  const wall = elements.find((e) => e?.key === "walls");
  const roof = elements.find((e) => e?.key === "roofs");
  const windows = elements.find((e) => e?.key === "windows");
  const wallDesc = descriptionText(wall?.description);
  const roofDesc = descriptionText(roof?.description);
  const windowDesc = descriptionText(windows?.description);
  const blob = [epc.propertyType, epc.builtForm, wallDesc, roofDesc, windowDesc, epc.lodgementDate, epc.inspectionDate]
    .filter(Boolean)
    .join(" — ");
  return { blob, wallDesc, roofDesc, roofEff: roof?.energyEff ?? null, windowDesc };
}

/** Pure, criteria-independent survey/condition leverage: what to brief the surveyor and builder to
 *  dig into, and what a confirmed finding is realistically worth off the price — both as a repair
 *  cost and as a resalability/mortgageability discount that outlasts the repair itself. */
export function buildSurveyStrategy(prop: PropertyInput): SurveyIssue[] {
  const { blob, wallDesc, roofDesc, roofEff, windowDesc } = epcTextBlob(prop);
  const nonStandardHit = NON_STANDARD_PATTERNS.find((re) => re.test(blob));
  const eraHit = PRE_2000_ERA_PATTERNS.find((re) => re.test(blob));
  const singleGlazedHit = windowDesc ? /single\s*glaz/i.test(windowDesc) : false;

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

  // Damp — rising/penetrating damp is a near-universal Level 3 finding worth a dedicated brief;
  // not derivable from EPC data, so always "routine".
  issues.push({
    key: "damp",
    title: "Damp (rising, penetrating & condensation)",
    signal: "routine",
    surveyorBrief: "Ask for damp-meter readings room-by-room (not just a generic 'elevated readings in places' note), and a written opinion on the likely SOURCE — bridged/missing DPC, defective render or pointing, leaking gutters/downpipes, or condensation from inadequate ventilation. Source determines whether this is a £200 fix or a £5k+ remedial damp-proofing job.",
    builderBrief: "Where the surveyor flags damp, get the builder to quote for the most likely fix (re-pointing, DPC injection, extractor fans, render repairs) so you have a real number rather than the survey's generic 'monitor and treat' wording.",
    markdownNote: "Confirmed damp justifies a markdown covering the diagnosed remedial works plus redecoration of affected rooms — and where it's affected timber or plaster, factor in drying-out time before refurb can start, which has knock-on cost if you're financing the purchase.",
    markdownLowPct: 0.01,
    markdownHighPct: 0.04,
  });

  // Timber decay — woodworm, wet rot, dry rot. Always routine to brief.
  issues.push({
    key: "timber_decay",
    title: "Timber defects (woodworm, wet & dry rot)",
    signal: "routine",
    surveyorBrief: "Ask the surveyor to specifically check roof timbers, floor joists (especially near bathrooms/kitchens and external walls), and any exposed structural timber for active woodworm, wet rot or dry rot — and to distinguish 'historic, treated' from 'active, untreated'. Dry rot in particular can spread well beyond the visibly affected area.",
    builderBrief: "If active rot or live infestation is flagged, get a specialist timber treatment quote (not a general builder estimate) — dry rot remediation often requires removing affected masonry/plaster well beyond the visible outbreak, which a general quote will under-price.",
    markdownNote: "Confirmed active timber decay justifies a markdown covering specialist treatment plus replacement of affected structural timber — dry rot findings in particular should be treated as a stop-the-clock issue until scope and cost are confirmed by a specialist.",
    markdownLowPct: 0.01,
    markdownHighPct: 0.035,
  });

  // Windows & external joinery — flagged where the EPC register itself describes single glazing.
  issues.push({
    key: "windows_joinery",
    title: "Windows, doors & external joinery",
    signal: singleGlazedHit ? "flagged" : "routine",
    evidence: singleGlazedHit
      ? `EPC register window description: "${windowDesc}" — single glazing increases heat loss, noise transmission and condensation risk, and is a routine like-for-like replacement item buyers price in.`
      : windowDesc
        ? `EPC register window description: "${windowDesc}".`
        : undefined,
    surveyorBrief: "Ask the surveyor to note the condition (not just the glazing type) of every external door, window frame and sill — rotten timber sills/frames, failed double-glazed unit seals (visible misting) and doors that no longer close/seal properly are common and easy to under-notice on a walk-round.",
    builderBrief: "Get a per-unit quote for replacing the worst-condition windows/doors flagged, plus a blended figure for a fuller like-for-like replacement programme if the property is older stock — this is one of the easiest line items to get a hard, comparable quote for.",
    markdownNote: "Confirmed window/door condition issues justify a like-for-like markdown using the builder's per-unit quote — frame rot and failed glazing units are routine pre-letting costs that buyers expect to negotiate, not defects to argue line-by-line.",
    markdownLowPct: 0.01,
    markdownHighPct: 0.03,
  });

  // Drainage & rainwater goods — below-ground drainage and gutters/downpipes.
  issues.push({
    key: "drainage_rainwater",
    title: "Drainage & rainwater goods",
    signal: "routine",
    surveyorBrief: "A standard Level 3 survey won't lift manhole covers or run a CCTV drain survey — ask the surveyor for their visual opinion on gutters, downpipes and visible manhole covers, and recommend (in writing) whether a specialist CCTV drainage survey is warranted given the property's age and any damp findings.",
    builderBrief: "If gutters/downpipes are visibly damaged, blocked or poorly aligned, get a quote for full replacement/clearance — these are cheap to fix but expensive to ignore, since persistent overflow is a leading cause of penetrating damp and foundation saturation.",
    markdownNote: "Confirmed drainage/rainwater defects justify a modest markdown covering repair or clearance — but if a CCTV survey reveals a collapsed or root-infiltrated run, that's a much larger (often £2k-£6k+) excavation and relining cost that should be separately quoted and negotiated once known.",
    markdownLowPct: 0.005,
    markdownHighPct: 0.02,
  });

  // Electrics & plumbing/heating — beyond the statutory EICR/CP12 certificates already costed
  // in the negotiation playbook, this covers visible system age/condition (consumer unit type,
  // visible wiring, boiler age, radiators, visible pipework).
  issues.push({
    key: "electrics_plumbing",
    title: "Electrical & plumbing/heating systems (condition & age)",
    signal: "routine",
    surveyorBrief: "Ask the surveyor for their opinion on the visible age/type of the consumer unit and wiring (e.g. rewireable fuses or pre-1960s wiring colours are a red flag regardless of what an EICR says about safety), and the apparent age and condition of the boiler, cylinder, radiators and visible pipework — a system that's 'safe' can still be at the end of its useful life.",
    builderBrief: "Where the consumer unit/wiring or heating system looks dated, get a quote for a full rewire and/or boiler + system replacement — these are five-figure jobs on an older property and should be priced in before you commit, not discovered after exchange.",
    markdownNote: "Confirmed end-of-life electrical or heating systems justify a markdown toward the replacement quote — a rewire or new heating system is disruptive and typically needs to happen before (or very early in) any refurb, so it shapes both your budget and your project sequencing.",
    markdownLowPct: 0.01,
    markdownHighPct: 0.035,
  });

  // Insulation / energy efficiency shortfalls beyond what the EPC headline rating already prices.
  issues.push({
    key: "insulation_energy",
    title: "Insulation shortfalls (loft, cavity & floor)",
    signal: "routine",
    surveyorBrief: "Ask the surveyor to note whether loft insulation depth, cavity wall fill and underfloor insulation appear adequate by current standards (loft: ~270mm) — these are cheap, high-impact upgrades that are often skipped by sellers and easy to overlook against bigger-ticket items.",
    builderBrief: "Get a quote for topping up loft insulation and, if the property has an unfilled cavity suitable for retrofit, cavity wall insulation — both are typically inexpensive relative to the EPC and running-cost improvement they deliver.",
    markdownNote: "Confirmed insulation shortfalls justify a small markdown covering topping-up costs — low individual cost, but worth logging since it also feeds directly into the EPC-improvement costing used elsewhere in this playbook.",
    markdownLowPct: 0.005,
    markdownHighPct: 0.015,
  });

  // Japanese knotweed / invasive species — never derivable from listing data, always "watch".
  issues.push({
    key: "japanese_knotweed",
    title: "Japanese knotweed & other invasive species",
    signal: "watch",
    evidence: "No data source available flags this — it can only be confirmed by inspecting the garden/grounds (and neighbouring boundaries) directly, ideally during the growing season (spring-autumn) when it's identifiable.",
    surveyorBrief: "Ask the surveyor to walk the full garden/grounds and boundaries (not just what's visible from the house) specifically for Japanese knotweed, giant hogweed or similar invasive species, and to check the seller's TA6 form answer against what they actually observe.",
    builderBrief: "If knotweed is suspected, get a quote from a PCA-accredited invasive species specialist for a treatment/management plan with an insurance-backed guarantee — lenders increasingly require this before completion if knotweed is within 7m of habitable space.",
    markdownNote: "Confirmed knotweed (or other notifiable invasive species) close to the building justifies a markdown covering a multi-year treatment programme with insurance-backed guarantee — and can affect mortgageability until a plan is in place, so treat this as a potential transaction-blocker, not just a price chip.",
    markdownLowPct: 0.01,
    markdownHighPct: 0.04,
  });

  // External areas, boundaries & outbuildings — garages, sheds, fences, paths, drives.
  issues.push({
    key: "external_grounds",
    title: "External areas, boundaries & outbuildings",
    signal: "routine",
    surveyorBrief: "Ask the surveyor to comment on the condition of any garage, shed, outbuilding, boundary walls/fences, paths and driveway — and to flag anything that looks like it encroaches on or is encroached by a neighbouring property (a boundary/title issue, not just a condition one).",
    builderBrief: "Where outbuildings or boundary structures are in poor condition, get a quote for repair or removal/replacement — these are routine but easy-to-forget line items that add up across a property, especially if any are needed for your strategy (e.g. a garage you plan to convert).",
    markdownNote: "Confirmed external/outbuilding condition issues justify a modest markdown covering repair or clearance — individually small, but worth logging as part of a comprehensive pre-letting/refurb budget rather than discovering them piecemeal after exchange.",
    markdownLowPct: 0.005,
    markdownHighPct: 0.02,
  });

  return issues;
}

// Where on an issue's [markdownLowPct, markdownHighPct] range each severity tier sits — low
// severity sits at the bottom of the recommended range, high severity at the top, medium at the
// midpoint. This keeps the checkbox+severity UI directly traceable to the same ranges shown in
// the static survey-strategy briefing above.
const SEVERITY_RATIO: Record<SurveySeverity, number> = { low: 0, medium: 0.5, high: 1 };

/** Turns confirmed survey findings (`prop.survey_findings`, keyed by `SurveyIssue.key`) into
 *  negotiation points: each confirmed finding becomes a "fault" (survey-confirmed, high
 *  confidence) leverage line, sized by severity within that issue's markdown range. These feed
 *  into `buildNegotiation`'s totals (so they tighten the offer plan) and surface verbatim in the
 *  talking-points script as survey results. */
export function buildSurveyNegotiationPoints(prop: PropertyInput): NegotiationPoint[] {
  const findings: SurveyFindings | undefined = (prop as any).survey_findings;
  if (!findings) return [];
  const asking = prop.asking_price_gbp ?? 0;
  if (asking <= 0) return [];

  const issues = buildSurveyStrategy(prop);
  const out: NegotiationPoint[] = [];
  for (const issue of issues) {
    const f = findings[issue.key];
    if (!f?.active) continue;
    const ratio = SEVERITY_RATIO[f.severity] ?? 0.5;
    const pct = issue.markdownLowPct + (issue.markdownHighPct - issue.markdownLowPct) * ratio;
    const gbp = Math.round(asking * pct);
    const severityLabel = f.severity === "low" ? "Low" : f.severity === "high" ? "High" : "Medium";
    out.push({
      category: "fault",
      title: `Survey: ${issue.title} (${severityLabel} severity)`,
      description: `${issue.markdownNote}${f.note ? ` Surveyor's note: "${f.note}"` : ""}`,
      gbp_impact: gbp,
      confidence: "high",
    });
  }
  return out;
}
