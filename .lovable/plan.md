# Phase 3 — Deal quality, risk flags, refurb estimator & smarter AI

This phase tightens analysis accuracy and reduces "junk" listings, then upgrades AI to a single multi-aspect call per property (and optionally batched across the library).

## 1. Risk & "junk listing" filter

New per-property `risk_flags` (jsonb) computed on ingest + on demand:

- `shared_ownership` — keyword scan: "shared ownership", "% share", "staircasing" in title/desc/agent blurb
- `leasehold_short` — tenure = Leasehold AND (lease_years_remaining if known) < 80; flag separately `leasehold` when tenure is leasehold but term unknown
- `listed_building` — "grade i", "grade ii", "listed building"
- `auction` — "auction", "guide price", "modern method of auction", "MMoA", "unconditional", "reservation fee"
- `developer_invitation` — "offers invited", "from £", "starting price", "coming soon", "off-plan", "reservations open", new-build developer agent patterns
- `land_only` — propertyType = Land / "plot" / "building plot" / "planning granted" with no dwelling
- `planning_only` — "planning permission" + no existing dwelling
- `fake_or_underpriced` — price < 40% of postcode median per sqm (when comparable data available) OR price < £30k for a residential dwelling outside known low-value areas

UI:
- Property card shows red/amber chip per flag (tooltipped)
- Properties list: default sort pushes flagged items to bottom; toggle "Hide flagged" in filter bar
- Per-flag setting in persona to **always hide** vs **show & rank low**

Score impact: each red flag drops overallScore to ≤ 20 and disables incompatible strategies.

## 2. HMO Article 4 check

Add `article4_status` to properties (`unknown | inside | outside | partial`).

Sources, in order of preference:
1. Cached lookup table `article4_areas` (postcode prefix + council name) — seeded with known major Article 4 areas (Nottingham, Birmingham selective wards, Manchester, Sheffield, Leeds, Liverpool, Cardiff, Bristol BS5/6/7, Brighton, Portsmouth, Southampton SO14-17, Reading, Oxford, Milton Keynes, etc.)
2. AI fallback when uncached (single call with postcode + council)
3. User override per property

Engine rule: if `strategy = HMO` and `article4_status = inside`, the strategy is downgraded with a clear warning ("Article 4 — planning required") and score capped. Persona-match flags HMO mismatch automatically.

UI: chip on property detail + warning banner inside HMO strategy panel.

## 3. Gross yield — correctness & rent comparables

Today `engine.ts` uses `persona.target_rent_gbp` for every property — wrong. Fix:

- Add `properties.estimated_rent_pcm` and `rent_source` enum (`pf_json | csv | ai_comparables | manual | persona_default`)
- Compute order:
  1. If JSON/CSV provides a rent figure, use it
  2. Else if AI comparables result stored, use it
  3. Else if persona default exists, use it (mark `persona_default` — show amber)
  4. Else `null` → show "Rent unknown" and exclude from yield-sensitive scores
- Gross yield formula written in one place: `grossYield = (rent_pcm * 12) / asking_price`, displayed alongside `(rent_pcm * 12) / (offer + refurb + costs)` as "yield on total cash in"
- Tooltip on every yield figure showing the inputs and source

## 4. AI — one call per property, optional batch

Replace photo-only `analyseWithAI` with `analyseProperty` returning a single structured payload (one credit per property):

```
{
  condition: { score, items[], summary, photoFindings[] },
  refurb: { items[], totalLow, totalMid, totalHigh, confidence },
  rent: { pcm, low, high, source: "ai_comparables", evidence[] },
  article4: { status, council, evidence },
  riskFlags: { sharedOwnership, leasehold, listed, auction, developerInvite, land, planningOnly, notes },
  negotiation: { angles[], suggestedOffer, walkAway },
  strategyHints: { suitable: ["BTL","HMO",...], unsuitable: [...], reasoning }
}
```

- Stored on `analyses.ai_payload` (jsonb) with `ai_version`
- Persona setting renamed: **AI usage** → `off | per-property | auto-all`
- New `analyseLibraryWithAI` server fn iterates properties missing payloads and runs them with concurrency 4

## 5. Refurb estimator (algorithmic, AI-augmented)

New module `src/lib/analysis/refurb.ts` with a categorised cost matrix (£/sqm and £/room, UK 2026):

Categories: kitchen, bathroom, rewire, replumb, boiler/heating, windows, roof, external/render, damp, plaster/decor, flooring, garden/external works, EPC upgrade.

Inputs:
- `area_sqm`, `beds`, `baths`, `property_type`, `epc_rate`
- Quality tier from AI condition score (or manual): `light | medium | heavy | full-gut`
- Location modifier (London +25%, SE +15%, NW/NE/Wales -5%, etc., from postcode prefix)

Output: per-category line items with low/mid/high, summed total, contingency 10%.

If AI payload present, AI item estimates override matrix per-category and the matrix fills the gaps. Shown in a new `RefurbPanel` on property detail with editable rows.

Refurb total feeds straight into BRRR/Flip ROI and total-cash-in yield.

## 6. Images & multi-source ingest

- Property card hero: prefer `pf_json.propertyDetail.images[0]` → CSV image column → uploaded photo → placeholder
- Store image URLs in `properties.image_urls text[]` on ingest
- Per-property "Enrich" button → paste Rightmove/Zoopla URL OR paste Property Filter JSON → server fn scrapes (Firecrawl) the listing page, fills missing fields and image URLs
- Optional connector: Firecrawl (already documented) for Rightmove/Zoopla/OnTheMarket/Boomin scraping. We'll prompt user to link Firecrawl when they first use Enrich

## 7. Migration & code surface

- Migration: `risk_flags jsonb`, `article4_status text`, `estimated_rent_pcm numeric`, `rent_source text`, `image_urls text[]` on `properties`; `ai_payload jsonb`, `ai_version text` on `analyses`; new `article4_areas` reference table (seeded)
- Engine: thread `risk_flags`, `article4_status`, real `estimated_rent_pcm`, and `refurb.total` through scoring
- New files: `src/lib/analysis/risk.ts`, `src/lib/analysis/article4.ts`, `src/lib/analysis/refurb.ts`, `src/lib/enrich.functions.ts`, `src/components/RefurbPanel.tsx`, `src/components/RiskChips.tsx`
- Replace `ai.functions.ts` `analyseWithAI` with `analyseProperty` + add `analyseLibraryWithAI`

## Out of scope (next phase)

- Live SA revenue scraping (AirDNA / Mashvisor)
- Council-tax & EPC API integrations
- Comparable-sales API (Land Registry)
