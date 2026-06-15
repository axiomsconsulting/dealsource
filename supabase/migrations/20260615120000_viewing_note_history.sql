-- Snapshots of viewing notes captured each time "Analyse with AI" runs, so the user can
-- review, edit, delete or restore a past note into the General notes box and re-run analysis.
-- Each entry: { id: string, createdAt: string (ISO), text: string }
ALTER TABLE public.properties ADD COLUMN viewing_note_history JSONB DEFAULT '[]'::jsonb;
