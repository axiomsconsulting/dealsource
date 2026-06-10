import type { PropertyInput } from "./types";

export type RefurbTier = "light" | "medium" | "heavy" | "full_gut";

export interface RefurbLine {
  category: string;
  label: string;
  qty: number;
  unit: string;
  rate: number;
  low: number;
  mid: number;
  high: number;
  source: "algo" | "ai" | "manual";
  note?: string;
}

export interface RefurbEstimate {
  tier: RefurbTier;
  lines: RefurbLine[];
  totalLow: number;
  totalMid: number;
  totalHigh: number;
  contingency: number;
  total: number; // mid + contingency
  locationModifier: number;
  notes: string[];
}

// UK base rates (£) — mid 2026 averages, tuneable. Each entry: { low, mid, high }
const ROOMS = {
  kitchen: { light: [1500, 2500, 3500], medium: [4500, 6500, 9000], heavy: [9000, 13000, 18000], full_gut: [14000, 20000, 28000] },
  bathroom: { light: [1200, 2000, 3000], medium: [3500, 5000, 7000], heavy: [6500, 9000, 13000], full_gut: [10000, 14000, 18000] },
  boiler: { light: [0, 0, 0], medium: [2200, 2800, 3500], heavy: [2800, 3500, 4500], full_gut: [3500, 4500, 6000] },
};
const PER_SQM = {
  rewire: { light: [0, 0, 0], medium: [55, 75, 95], heavy: [80, 110, 140], full_gut: [110, 140, 180] },
  replumb: { light: [0, 0, 0], medium: [40, 55, 75], heavy: [60, 85, 110], full_gut: [85, 120, 160] },
  plaster_decor: { light: [12, 18, 25], medium: [25, 35, 50], heavy: [45, 65, 90], full_gut: [70, 95, 130] },
  flooring: { light: [18, 25, 35], medium: [25, 35, 50], heavy: [40, 55, 75], full_gut: [55, 75, 100] },
  windows: { light: [0, 0, 0], medium: [120, 160, 220], heavy: [160, 220, 300], full_gut: [200, 280, 380] },
  roof: { light: [0, 0, 0], medium: [0, 0, 0], heavy: [80, 120, 170], full_gut: [120, 170, 240] },
  external: { light: [0, 0, 0], medium: [15, 25, 40], heavy: [30, 50, 75], full_gut: [55, 85, 120] },
  damp: { light: [0, 0, 0], medium: [25, 40, 60], heavy: [55, 80, 120], full_gut: [85, 120, 160] },
  epc_upgrade: { light: [0, 0, 0], medium: [10, 18, 30], heavy: [25, 40, 60], full_gut: [40, 60, 90] },
};

// Regional multiplier endpoints (London 1.55x, North East/NI 0.90x, West Midlands 1.00x
// benchmark) follow Property Filter's published refurbishment cost calculator
// (https://property-filter.co.uk/free-calculators/refurbishment-cost-calculator); the bands
// in between are interpolated against that range.
const LOCATION_MOD: { match: RegExp; mod: number; name: string }[] = [
  { match: /^(W|WC|EC|E|N|NW)/, mod: 1.55, name: "London" },
  { match: /^(SE|SW|KT|TW|HA|UB|EN|IG|RM|BR|CR|DA|SM|GU|RH)/, mod: 1.30, name: "London commuter belt" },
  { match: /^(RG|SL|MK|HP|OX|CB|SG|AL|LU|CM|CO|IP|BN|TN|PO|SO|BH|DT|SP)/, mod: 1.15, name: "South / South-East" },
  { match: /^(BS|BA|GL|EX|TQ|PL|TR)/, mod: 1.10, name: "South-West" },
  { match: /^(CF|NP|SA|LD|SY|HR|WR|DY|B|CV|WS|WV|ST|TF|NG|LE|DE|PE|NN)/, mod: 1.00, name: "Midlands" },
  { match: /^(LN|S|DN|HU|YO|HG|HX|HD|WF|LS|BD|BB|PR|FY|L|CH|WA|M|OL|BL|SK|CW)/, mod: 0.95, name: "North-West / Yorkshire" },
  { match: /^(NE|SR|DH|DL|TS|CA|LA)/, mod: 0.90, name: "North-East / Cumbria" },
];

export function locationModifier(postcode: string | null | undefined): { mod: number; name: string } {
  const out = (postcode || "").toUpperCase().replace(/\s+/g, "");
  for (const r of LOCATION_MOD) if (r.match.test(out)) return { mod: r.mod, name: r.name };
  return { mod: 1.0, name: "UK average" };
}

export function tierFromConditionScore(score: number | null | undefined): RefurbTier {
  if (score == null) return "medium";
  if (score >= 8) return "light";
  if (score >= 6) return "medium";
  if (score >= 3.5) return "heavy";
  return "full_gut";
}

function band(arr: number[]): [number, number, number] { return [arr[0], arr[1], arr[2]]; }

function pushRoom(lines: RefurbLine[], category: string, label: string, count: number, tier: RefurbTier, mod: number, table: Record<RefurbTier, number[]>) {
  if (count <= 0) return;
  const [l, m, h] = band(table[tier]);
  if (m === 0) return;
  lines.push({
    category, label, qty: count, unit: "room", rate: m,
    low: Math.round(l * count * mod),
    mid: Math.round(m * count * mod),
    high: Math.round(h * count * mod),
    source: "algo",
  });
}

function pushSqm(lines: RefurbLine[], category: string, label: string, sqm: number, tier: RefurbTier, mod: number, table: Record<RefurbTier, number[]>) {
  if (sqm <= 0) return;
  const [l, m, h] = band(table[tier]);
  if (m === 0) return;
  lines.push({
    category, label, qty: Math.round(sqm), unit: "m²", rate: m,
    low: Math.round(l * sqm * mod),
    mid: Math.round(m * sqm * mod),
    high: Math.round(h * sqm * mod),
    source: "algo",
  });
}

export function estimateRefurb(p: PropertyInput, tier: RefurbTier = "medium", aiItems?: { category?: string; estimateGbp?: number; issue?: string }[]): RefurbEstimate {
  const { mod, name: locName } = locationModifier(p.postcode);
  const beds = p.beds ?? 3;
  const baths = p.baths ?? Math.max(1, Math.floor(beds / 2));
  const sqm = p.area_sqm ?? (60 + beds * 18);
  const epc = (p.epc_rate || "").toUpperCase();
  const needsEpcUplift = ["E", "F", "G"].includes(epc);

  const lines: RefurbLine[] = [];
  pushRoom(lines, "kitchen", "Kitchen refit", 1, tier, mod, ROOMS.kitchen as any);
  pushRoom(lines, "bathroom", `Bathroom refit ×${baths}`, baths, tier, mod, ROOMS.bathroom as any);
  pushRoom(lines, "boiler", "New boiler / heating", 1, tier, mod, ROOMS.boiler as any);
  pushSqm(lines, "rewire", "Full rewire", sqm, tier, mod, PER_SQM.rewire as any);
  pushSqm(lines, "replumb", "Replumb", sqm, tier, mod, PER_SQM.replumb as any);
  pushSqm(lines, "plaster_decor", "Plaster & decor", sqm, tier, mod, PER_SQM.plaster_decor as any);
  pushSqm(lines, "flooring", "Flooring", sqm, tier, mod, PER_SQM.flooring as any);
  pushSqm(lines, "windows", "Windows (double glazing)", sqm, tier, mod, PER_SQM.windows as any);
  pushSqm(lines, "roof", "Roof works", sqm, tier, mod, PER_SQM.roof as any);
  pushSqm(lines, "external", "External / render / gutters", sqm, tier, mod, PER_SQM.external as any);
  pushSqm(lines, "damp", "Damp / structural", sqm, tier, mod, PER_SQM.damp as any);
  if (needsEpcUplift) pushSqm(lines, "epc_upgrade", `EPC ${epc}→C uplift`, sqm, tier === "light" ? "medium" : tier, mod, PER_SQM.epc_upgrade as any);

  // AI override / addition per category
  if (aiItems?.length) {
    for (const it of aiItems) {
      if (!it.estimateGbp || it.estimateGbp <= 0) continue;
      const cat = (it.category || "").toLowerCase() || "other";
      const idx = lines.findIndex((l) => l.category === cat);
      const adjusted = Math.round(it.estimateGbp * mod);
      if (idx >= 0) {
        lines[idx] = { ...lines[idx], mid: adjusted, low: Math.round(adjusted * 0.8), high: Math.round(adjusted * 1.25), source: "ai", note: it.issue };
      } else {
        lines.push({ category: cat, label: it.issue || cat, qty: 1, unit: "item", rate: adjusted, low: Math.round(adjusted * 0.8), mid: adjusted, high: Math.round(adjusted * 1.25), source: "ai", note: it.issue });
      }
    }
  }

  const totalLow = lines.reduce((s, l) => s + l.low, 0);
  const totalMid = lines.reduce((s, l) => s + l.mid, 0);
  const totalHigh = lines.reduce((s, l) => s + l.high, 0);
  const contingency = Math.round(totalMid * 0.10);
  const total = totalMid + contingency;

  return {
    tier, lines, totalLow, totalMid, totalHigh, contingency, total,
    locationModifier: mod,
    notes: [`Location: ${locName} (×${mod.toFixed(2)})`, `Tier: ${tier}`, `Approx ${Math.round(sqm)}m² · ${beds} bed · ${baths} bath`],
  };
}