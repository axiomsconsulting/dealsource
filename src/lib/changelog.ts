export type ChangelogEntryType = "major" | "minor" | "patch";

export interface ChangelogEntry {
  version: string;
  date: string;
  type: ChangelogEntryType;
  title: string;
  items: string[];
}

/** Newest first. Written in terms of what changed for you, not how it was built. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.6.0",
    date: "2026-06-15",
    type: "minor",
    title: "Install as an app, and a smoother mobile experience",
    items: [
      "Install Deal Negotiator on your phone's home screen for a full-screen, app-like experience",
      "Fixed the header overlapping the status bar on iPhones when installed as an app",
      "On-site viewing notes are now saved reliably even if you navigate away quickly",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-06-14",
    type: "minor",
    title: "Capture viewing notes on-site, with voice and history",
    items: [
      "Dictate notes during a viewing using your phone's microphone",
      "Every note you've taken is kept in a history so you can review how your assessment evolved",
      "AI reads your freeform notes and automatically files findings under the right survey category",
    ],
  },
  {
    version: "1.4.1",
    date: "2026-06-13",
    type: "patch",
    title: "Personalise your workspace",
    items: [
      "Admins can now customise the app's colour theme",
      "Profile photos and favourites are easier to manage",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-06-12",
    type: "minor",
    title: "See nearby comparables, refreshed mobile layout",
    items: [
      "Find similar properties for sale, under offer, or recently sold near any deal",
      "Redesigned layouts that work better on phones and tablets",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-06-10",
    type: "minor",
    title: "Cleaner property cards, automatic EPC lookup",
    items: [
      "Property cards can now be collapsed to scan your pipeline faster",
      "EPC ratings are fetched automatically when you add a new property",
      "Recalculate a deal's numbers instantly after editing any input",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-06-08",
    type: "minor",
    title: "Usability improvements across the board",
    items: [
      "Faster navigation and clearer labelling throughout the app",
      "Fixed display issues on the property analysis screens",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-05",
    type: "minor",
    title: "HMO and serviced-accommodation layout planning",
    items: [
      "AI reviews floor plans to suggest realistic HMO room conversions and ensuite placements",
      "Strategy tabs reorganised into a clearer grid so you can compare BTL, HMO, SA and flip angles side by side",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-06-02",
    type: "patch",
    title: "Deal sheet redesign",
    items: [
      "Refreshed deal sheet layout and PDF export",
      "Fixed sharing links that previously failed to open",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-28",
    type: "major",
    title: "Welcome to Deal Negotiator",
    items: [
      "Build a pipeline of properties and track them through your investment process",
      "AI-powered analysis covers condition, refurb costs, rent estimates, Article 4 status and negotiation angles",
      "Generate shareable deal sheets to summarise an opportunity",
    ],
  },
];
