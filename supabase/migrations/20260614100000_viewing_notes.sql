-- Free-form per-area notes captured during a property viewing (e.g. "kitchen", "bedroom_1",
-- "garden", plus a "general" catch-all), keyed by area — analysed by AI to auto-populate
-- `survey_findings`.
ALTER TABLE public.properties ADD COLUMN viewing_notes JSONB;
