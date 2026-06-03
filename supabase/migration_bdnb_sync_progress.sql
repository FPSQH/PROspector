-- ══════════════════════════════════════════════════════════════════
-- Migration: bdnb_sync_progress
-- Tracks per-commune BDNB ingestion state for resumable background sync
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bdnb_sync_progress (
  code_insee        TEXT PRIMARY KEY,
  nom               TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  -- pending | ingesting | matching | done | error
  batiments_ingeres INTEGER NOT NULL DEFAULT 0,
  next_offset       INTEGER NOT NULL DEFAULT 0,
  adresses_matchees INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT,
  started_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bdnb_sync_progress ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bdnb_sync_progress' AND policyname = 'authenticated_read_progress') THEN
    EXECUTE 'CREATE POLICY "authenticated_read_progress" ON bdnb_sync_progress FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bdnb_sync_progress' AND policyname = 'authenticated_write_progress') THEN
    EXECUTE 'CREATE POLICY "authenticated_write_progress" ON bdnb_sync_progress FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bdnb_sync_progress' AND policyname = 'authenticated_update_progress') THEN
    EXECUTE 'CREATE POLICY "authenticated_update_progress" ON bdnb_sync_progress FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bdnb_sync_progress' AND policyname = 'service_role_all_progress') THEN
    EXECUTE 'CREATE POLICY "service_role_all_progress" ON bdnb_sync_progress FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
