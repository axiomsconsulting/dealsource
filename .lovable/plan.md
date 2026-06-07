
# Deal Sourcer — Property Investment Analyser

A property deal sourcing & analysis platform for UK investors. Ingest properties from Property Filter CSV exports + per-property JSON, run strategy analysis (BTL / BRRR / SA / HMO / Flip / Title Split), generate negotiation playbooks and shareable deal sheets, store everything in the database, and iterate via interactive sliders.

Because this is a large scope, I'll build it in **phases**. Phase 1 ships a working end-to-end product with the highest-value paths; later phases add depth.

---

## Phase 1 — MVP (this build)

### Stack
- TanStack Start + Tailwind + shadcn (existing template)
- Lovable Cloud (Postgres + Auth + Storage) — enabled now
- Lovable AI Gateway (`google/gemini-3-flash-preview` for analysis, `google/gemini-2.5-flash` for image vision) — used only when user toggles "Use AI"
- Algorithmic engine runs always (deterministic, no credits)

### Database (Cloud)
- `profiles` (auto)
- `personas` — investor persona (cash, target rent, strategy bias, ignore list, refurb assumptions, mortgage rate, stress rate). Seeded with the BTL £60k persona.
- `properties` — one row per address. Stores merged Property Filter JSON, CSV row, ingest source, hide_address flag.
- `analyses` — strategy results (BTL/BRRR/SA/HMO/Flip/TitleSplit), scores, deal % rating, negotiation JSON, refurb estimate JSON, cashflow JSON, AI notes.
- `photos` — uploaded photos (Storage bucket `property-photos`), linked to property, with AI-detected issues.
- `deal_sheets` — generated snapshots, share token, redaction settings.

RLS: per-user on everything; `deal_sheets` readable by anon via share token.

### Pages / Routes
- `/` — Landing → redirects to `/dashboard` if signed in.
- `/auth` — email/password sign-in.
- `/_authenticated/dashboard` — **single-screen ingest hub**: tabs for *Postcode/Area* (manual entry stub), *CSV upload* (Property Filter export), *Paste JSON*, *Upload JSON files*, *Photos zip*. Drop-zone style, one Submit.
- `/_authenticated/properties` — grid/list of all ingested properties with filter (strategy fit, persona pass/fail, % deal rating).
- `/_authenticated/properties/$id` — deep analysis view:
  - Header (address, hide toggle, photos gallery)
  - Strategy tabs (BTL / BRRR / SA / HMO / Flip / Title Split) each with full numbers
  - **Sliders** (offer price, rent, mortgage rate, refurb, LTV, ARV) — all numbers update reactively; numeric inputs paired with each slider
  - Negotiation panel (faults / leverage points / improvement gaps / condition issues — each with £ impact)
  - Refurb estimate (from photo AI + heuristics)
  - Cashflow max strategies (rent-by-room, SA, lease options suggestions)
  - "Generate Deal Sheet" button
- `/_authenticated/personas` — list + edit personas (seeded BTL persona pre-populated from user's description).
- `/deal/$token` — public shareable deal sheet (respects redaction).

### Ingestion logic
- **CSV parser** (PapaParse) — handles the Property Filter export columns shown, creates property rows.
- **JSON parser** — accepts the Property Filter JSON shape (`propertyLight` + `propertyDetail`), merges into property row.
- **Photo upload** — multi-file + zip extraction client-side (JSZip), stored in Storage.
- All ingest paths converge on `ingestProperty()` server fn → upsert by postcode+address.

### Analysis engine (`src/lib/analysis/`)
Pure TS, deterministic. Computes per strategy:
- BTL: yield, ROI on cash left in, cashflow @ stress rate, refinance equity release timing
- BRRR: ARV, refi proceeds, cash left in, months to recycle
- SA: occupancy-weighted income (city defaults), net after costs
- HMO: room count × £/room, licensing flag, Article 4 check (from JSON)
- Flip: GDV − costs − SDLT − fees − finance
- Title Split: feasibility flag based on tenure/property type
Plus **deal score** 0–100% combining yield, cash-left-in, equity gained, risk flags.
Persona match runs filters (beds, bed-size, era, parking, heating, EPC).

### Negotiation generator
Algorithmic rules using JSON signals (multipleReduce, multipleBack, days on market, price diff, EPC, last sold + years, equity). Each point outputs `{title, description, £impact, confidence}`. AI toggle enriches with photo-based and free-text reasoning.

### AI usage (opt-in per analysis)
- Vision call on selected photos → refurb items + £ ranges + condition issues.
- Text call → negotiation narrative + cashflow optimisation suggestions.
Lovable AI Gateway via `createServerFn`.

### Deal Sheet
- Component renders a presentation-grade page with hero photo, key numbers, strategy summary, negotiation bullets.
- Toggle: *Full details* vs *Redacted* (hides street, exact number, exterior photos).
- Persisted; share via `/deal/$token`.

---

## Phase 2 (future — not in this build)
- Rightmove / Zoopla scraping integration
- Viewber API integration
- Comparable comps pulled live
- PDF export of deal sheet
- Team workspaces / multi-investor sharing
- Mortgage product lookup
- Saved searches + email alerts on new matches

---

## Technical notes
- Money stored as integer pence to avoid float drift.
- All slider state lives in component, persists via `useMutation` debounced to `analyses.overrides` JSONB so re-opening keeps your tuning.
- Profitability spreadsheet logic ported into `analysis/btl.ts` as the **baseline** with comments noting which assumptions are weak (e.g. no void allowance, no management fee buffer) — the engine improves on it.

---

## Deliverable for this turn
Phase 1 end-to-end: schema + auth + ingest (CSV + JSON + photos) + analysis engine + property detail with sliders + negotiation + deal sheet + share link. Seeded with the user's BTL persona. AI features wired but optional.

Confirm and I'll build it. If you want me to drop or defer anything from Phase 1 (e.g. skip SA/HMO/Flip in first pass, skip share link, skip AI vision), say so and I'll trim before starting.
