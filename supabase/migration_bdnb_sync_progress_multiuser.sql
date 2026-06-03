-- ══════════════════════════════════════════════════════════════════
-- Migration: bdnb_sync_progress → multi-tenant (ajout user_id)
--
-- bdnb_batiment_groupe reste globale (données publiques partagées).
-- bdnb_sync_progress est désormais par utilisateur.
-- ══════════════════════════════════════════════════════════════════

-- 1. Ajouter la colonne user_id
ALTER TABLE bdnb_sync_progress
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Changer la clé primaire : (user_id, code_insee)
ALTER TABLE bdnb_sync_progress DROP CONSTRAINT IF EXISTS bdnb_sync_progress_pkey;
ALTER TABLE bdnb_sync_progress ADD PRIMARY KEY (user_id, code_insee);

-- 3. Index pour les requêtes par utilisateur
CREATE INDEX IF NOT EXISTS bdnb_sync_progress_user_idx ON bdnb_sync_progress(user_id);

-- 4. Mettre à jour les politiques RLS pour isoler par utilisateur
DROP POLICY IF EXISTS "authenticated_read_progress"   ON bdnb_sync_progress;
DROP POLICY IF EXISTS "authenticated_write_progress"  ON bdnb_sync_progress;
DROP POLICY IF EXISTS "authenticated_update_progress" ON bdnb_sync_progress;
DROP POLICY IF EXISTS "service_role_all_progress"     ON bdnb_sync_progress;

CREATE POLICY "user_read_own_progress"
  ON bdnb_sync_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_insert_own_progress"
  ON bdnb_sync_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_update_own_progress"
  ON bdnb_sync_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_all_progress"
  ON bdnb_sync_progress FOR ALL TO service_role
  USING (true) WITH CHECK (true);
