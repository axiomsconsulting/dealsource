# Phase 4 — Export, batch AI, photo vision, interactive refurb & smarter negotiation

Eight discrete features. Each one is small enough to ship independently; I'll build them in this order so later features can rely on earlier ones.

## 1. Deal comparison CSV export

Toolbar on `/properties` gets a multi-select (checkbox column) + "Export CSV" button. Generates client-side CSV with columns:
`address, postcode, asking_price, recommended_offer, max_offer, est_rent_pcm, gross_yield, yield_on_cash_in, refurb_total, article4_status, best_strategy, deal_score, risk_severity, risk_flags`.
File downloads as `deal-comparison-YYYY-MM-DD.csv`.

## 2. Advanced risk ranking & filtering

`/properties` filter bar gets:
- "Min deal score" slider
- "Hide" toggle group per flag: `shared_ownership`, `auction`, `developer_invitation`, `land_only`, `planning_only`, `fake_or_underpriced`, `listed_building`, `retirement_only`, `leasehold_short`
- Sort selector: `Deal score`, `Yield`, `Price`, `Risk (clean first)`
- Per-flag persona setting: `hide | deprioritise | show` (defaults sensible per flag), stored on `personas.risk_policy jsonb`. Filter bar pre-loads from persona but can be overridden per session.

## 3. Photo upload + AI vision → refurb auto-populate

`PhotosPanel` upload already works. Add "Analyse photos" button that:
- Calls a new `analysePhotosForRefurb` server fn with signed URLs of selected photos
- Sends them to Gemini 2.5 Flash with a vision prompt asking for issues per category (kitchen, bathroom, roof, windows, damp, electrics, plumbing, decor, flooring, external, structural) with severity (light/medium/heavy/full_gut) and rough £ estimate
- Writes results to `properties.ai_payload.refurb.items` and bumps `ai_version`
- RefurbPanel automatically picks these up (already wired via `aiItems`)

Shows AI-derived items as editable rows with photo thumbnails alongside the issue.

## 4. Global AI batch analysis with progress bar

`/properties` toolbar "Run AI on all" button:
- Opens a dialog showing count, est credits (1 per property without existing payload)
- POSTs to `analyseLibraryWithAI` (already exists) — refactor to stream progress via polling a `ai_jobs` table (id, total, completed, errors, status)
- Frontend polls every 1s, renders progress bar + per-property status (queued/running/done/error)
- Final summary: "Analysed X properties · Y skipped · Z errors · ~X credits used"

## 5. Public investor PDF deal sheet (privacy toggles)

`/deal/$token` already exists. Add to `deal_sheets`:
- `hide_address boolean`
- `hide_photos boolean`
- `include_refurb_breakdown boolean`
- `include_risk_flags boolean`

`DealSheetPanel`: toggles before "Create share link". `/api/deal-pdf/$token` renders with those toggles. Address becomes "Property in {postcode area}" when hidden; photos section omitted; refurb summary collapses to single total.

## 6. Per-property JSON enrich + image library

In `PropertyDetail`:
- "Enrich from Property Filter JSON" button → opens dialog with textarea
- Paste JSON → server fn parses it (`enrichFromPfJson`), merges into `properties.pf_json`, extracts new fields (beds, baths, area_sqm, epc, tenure, asking_price, postcode) only where currently null, and appends new image URLs to `image_urls[]`
- New `ImageLibrary` component on property detail showing all images from `image_urls` + uploaded photos in a grid with lightbox

## 7. Interactive refurb estimator with checkboxes & low/mid/high

`RefurbPanel` rewrite:
- Each line gets a checkbox (include in total) — default on
- Each line gets a `low | mid | high` toggle — default mid
- Running total at top updates live
- "Use as negotiation chip" button per line sends item to negotiation list with `gbp_impact = chosen tier`
- Persist user choices to `properties.refurb_estimate.user_overrides jsonb` so they survive reload

Total feeds back into the deal engine's `effectiveInputs.refurb_cost`.

## 8. Comparables-driven negotiation + seller circumstances

New `NegotiationPanel`:
- **Comparables-based reduction estimate**: server fn `estimateSellerFlex` uses AI (Gemini 2.5 Flash) with postcode + asking price to estimate realistic % reduction range based on time-on-market patterns and recent sold prices. Shows: "Typical reduction in this area: 4-8% · Suggested first offer: £X · Walk-away: £Y"
- **Seller-circumstance checklist** (logged per property in new `properties.seller_context jsonb`):
  - `probate`, `divorce`, `negative_equity`, `chain_break`, `relocation`, `downsizing`, `family_difficulty`, `elderly_owner`, `children_moved_away`, `outgrown_property`, `financial_distress`, `landlord_exiting`, `tenant_in_situ`
  - Each checkbox with optional note field
  - Each ticked circumstance adds a weighted reduction estimate (e.g. probate +3%, divorce +2%, negative equity -2% as constraint, etc.)
- **Combined suggested offer**: comparables baseline − refurb items selected − circumstance weights = recommended offer. Shown as a single number with breakdown tooltip.
- Writes recommended offer back to the engine's `SliderOverrides.offer_price` when user clicks "Apply to deal".

## Technical changes

**Migration**:
- `properties`: add `seller_context jsonb default '{}'`, ensure `refurb_estimate.user_overrides` path is documented
- `deal_sheets`: add `hide_address`, `hide_photos`, `include_refurb_breakdown`, `include_risk_flags` (all boolean default false / true sensibly)
- `personas`: add `risk_policy jsonb default '{}'`
- New table `ai_jobs(id uuid pk, user_id uuid, kind text, total int, completed int default 0, errors int default 0, status text default 'queued', created_at, updated_at)` with RLS scoped to `user_id`
- GRANTs + RLS for ai_jobs

**New files**:
- `src/lib/export.ts` — CSV builder
- `src/lib/seller-context.ts` — circumstance weights & types
- `src/lib/ai-jobs.functions.ts` — start/poll batch jobs
- `src/components/NegotiationPanel.tsx`
- `src/components/ImageLibrary.tsx`
- `src/components/BatchAIDialog.tsx`

**Modified**:
- `src/routes/_authenticated/properties.index.tsx` — checkboxes, filter bar, sort, export, batch button
- `src/components/RefurbPanel.tsx` — checkboxes, low/mid/high toggles, "use as chip"
- `src/components/PhotosPanel.tsx` — "Analyse photos" button
- `src/components/DealSheetPanel.tsx` — privacy toggles
- `src/routes/api/deal-pdf.$token.ts` — honour toggles
- `src/lib/ai.functions.ts` — add `analysePhotosForRefurb`, `estimateSellerFlex`
- `src/lib/enrich.functions.ts` — add `enrichFromPfJson` (paste-JSON variant)
- `src/routes/_authenticated/properties.$id.tsx` — wire ImageLibrary, NegotiationPanel, enrich dialog
- `src/lib/personas.functions.ts` — `risk_policy` get/set

## Out of scope this phase

- Real Land Registry sold-price API (still AI-estimated)
- Realtime updates via Supabase Realtime for batch progress (using polling for simplicity)
- Multi-language PDF
