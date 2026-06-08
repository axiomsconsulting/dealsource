export type TimeOfDay = "night" | "morning" | "afternoon" | "evening";
export type Season = "winter" | "spring" | "summer" | "autumn";

export interface Greeting {
  timeOfDay: TimeOfDay;
  salutation: string;
  dateLabel: string;
  season: Season;
  seasonLabel: string;
  /** Set when today falls inside a named period relevant to the property market (e.g. "the January reset"). */
  periodLabel?: string;
  /** A negotiation-flavoured read on the current period — what it tends to mean for sellers and viewings. */
  marketNote: string;
}

const SEASON_LABELS: Record<Season, string> = {
  winter: "winter",
  spring: "spring",
  summer: "summer",
  autumn: "autumn",
};

const SEASON_NOTES: Record<Season, string> = {
  winter: "Cold, dark evenings cool buyer demand — patient, well-reasoned offers tend to land best.",
  spring: "The spring bounce brings fresh stock and renewed energy — the right ones won't hang around.",
  summer: "Long days but distracted buyers — quiet listings may have more room to move than they look.",
  autumn: "Serious sellers often emerge in autumn, wanting to complete before the Christmas slowdown.",
};

/** Named periods worth flagging to a negotiator — what they tend to mean for sellers, viewings and
 *  how much room there is to push on price. `from`/`to` are [month, day] and may wrap year-end. */
const MARKET_PERIODS: { label: string; note: string; from: [number, number]; to: [number, number] }[] = [
  { label: "the Christmas & New Year lull", from: [12, 18], to: [1, 2],
    note: "Many sellers go quiet until the new year — but the few still listing tend to be motivated. Good odds for a considered offer." },
  { label: "the January reset", from: [1, 3], to: [1, 19],
    note: "Fresh year, fresh instructions — a wave of new listings and sellers wanting a clean start often means more room to negotiate." },
  { label: "the spring half-term lull", from: [3, 24], to: [4, 14],
    note: "School holidays slow viewings right down — a good moment to follow up on properties that have gone quiet." },
  { label: "the summer holiday slowdown", from: [7, 18], to: [8, 31],
    note: "Buyers are away and competition thins out — listings still sitting in August can mean sellers are softening." },
  { label: "the autumn market run", from: [9, 1], to: [9, 21],
    note: "September brings buyers back from the summer and a fresh batch of stock — move quickly on the right ones." },
  { label: "Halloween & Bonfire Night", from: [10, 28], to: [11, 6],
    note: "Darker evenings mean fewer viewings — an opening to make a quieter, more considered approach." },
  { label: "the Black Friday run-up to Christmas", from: [11, 24], to: [12, 17],
    note: "Bargain-hunting mood is in the air, and sellers eyeing a pre-Christmas completion may be ready to move on price." },
];

function monthDay(month: number, day: number): number {
  return month * 100 + day;
}

function inWindow(date: Date, from: [number, number], to: [number, number]): boolean {
  const cur = monthDay(date.getMonth() + 1, date.getDate());
  const a = monthDay(...from);
  const b = monthDay(...to);
  return a <= b ? cur >= a && cur <= b : cur >= a || cur <= b;
}

function salutationFor(hour: number): { timeOfDay: TimeOfDay; salutation: string } {
  if (hour < 5) return { timeOfDay: "night", salutation: "Burning the midnight oil" };
  if (hour < 12) return { timeOfDay: "morning", salutation: "Good morning" };
  if (hour < 18) return { timeOfDay: "afternoon", salutation: "Good afternoon" };
  if (hour < 22) return { timeOfDay: "evening", salutation: "Good evening" };
  return { timeOfDay: "night", salutation: "Burning the midnight oil" };
}

function seasonFor(month: number): Season {
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

export function getGreeting(now: Date = new Date()): Greeting {
  const { timeOfDay, salutation } = salutationFor(now.getHours());
  const season = seasonFor(now.getMonth() + 1);
  const period = MARKET_PERIODS.find((p) => inWindow(now, p.from, p.to));
  return {
    timeOfDay,
    salutation,
    dateLabel: now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    season,
    seasonLabel: SEASON_LABELS[season],
    periodLabel: period?.label,
    marketNote: period?.note ?? SEASON_NOTES[season],
  };
}
