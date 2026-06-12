-- ============================================================
-- Migration : RLS scopé équipe + contrainte manager
-- Date      : 2026-06-12
-- Objectif  : Restreindre l'accès manager à son équipe uniquement
--             (commerciaux avec manager_id = auth.uid())
-- ============================================================


-- ── 1. CONTRAINTE ANTI-BOUCLE ───────────────────────────────
-- Empêche un manager de se désigner lui-même comme subordonné
ALTER TABLE commerciaux
  DROP CONSTRAINT IF EXISTS chk_no_self_manager;

ALTER TABLE commerciaux
  ADD CONSTRAINT chk_no_self_manager CHECK (manager_id != id);


-- ── 2. NOUVELLE FONCTION HELPER ─────────────────────────────
-- is_my_commercial(target_uid) : vérifie que target_uid est
-- un commercial de l'équipe du manager connecté
CREATE OR REPLACE FUNCTION is_my_commercial(target_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM commerciaux
    WHERE id = target_uid
      AND manager_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- is_manager() : conservée pour compatibilité ascendante
-- (utilisée dans les routes API existantes)
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM commerciaux
    WHERE id = auth.uid() AND role = 'manager'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ── 3. MISE À JOUR DES POLITIQUES RLS ───────────────────────
-- Chaque politique : commercial voit ses données,
--                    manager voit uniquement son équipe

-- commerciaux
DROP POLICY IF EXISTS "commerciaux_policy" ON commerciaux;
CREATE POLICY "commerciaux_policy" ON commerciaux
  FOR ALL USING (
    id = auth.uid()
    OR is_my_commercial(id)
  );

-- communes
DROP POLICY IF EXISTS "communes_policy" ON communes;
CREATE POLICY "communes_policy" ON communes
  FOR ALL USING (
    commercial_id = auth.uid()
    OR is_my_commercial(commercial_id)
  );

-- zones_prospection
DROP POLICY IF EXISTS "zones_policy" ON zones_prospection;
CREATE POLICY "zones_policy" ON zones_prospection
  FOR ALL USING (
    commercial_id = auth.uid()
    OR is_my_commercial(commercial_id)
  );

-- adresses : SELECT
DROP POLICY IF EXISTS "adresses_select" ON adresses;
CREATE POLICY "adresses_select" ON adresses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM communes
      WHERE code_insee = adresses.code_insee
        AND commercial_id = auth.uid()
        AND chargee_at IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM communes c
      WHERE c.code_insee = adresses.code_insee
        AND is_my_commercial(c.commercial_id)
        AND c.chargee_at IS NOT NULL
    )
  );

-- adresses : UPDATE
DROP POLICY IF EXISTS "adresses_update" ON adresses;
CREATE POLICY "adresses_update" ON adresses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM communes
      WHERE code_insee = adresses.code_insee
        AND commercial_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM communes c
      WHERE c.code_insee = adresses.code_insee
        AND is_my_commercial(c.commercial_id)
    )
  );

-- sessions_prospection
DROP POLICY IF EXISTS "sessions_policy" ON sessions_prospection;
CREATE POLICY "sessions_policy" ON sessions_prospection
  FOR ALL USING (
    commercial_id = auth.uid()
    OR is_my_commercial(commercial_id)
  );

-- interactions (via session)
DROP POLICY IF EXISTS "interactions_policy" ON interactions;
CREATE POLICY "interactions_policy" ON interactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions_prospection s
      WHERE s.id = interactions.session_id
        AND s.commercial_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM sessions_prospection s
      WHERE s.id = interactions.session_id
        AND is_my_commercial(s.commercial_id)
    )
  );

-- contacts
DROP POLICY IF EXISTS "contacts_policy" ON contacts;
CREATE POLICY "contacts_policy" ON contacts
  FOR ALL USING (
    commercial_id = auth.uid()
    OR is_my_commercial(commercial_id)
  );

-- rendez_vous
DROP POLICY IF EXISTS "rdv_policy" ON rendez_vous;
CREATE POLICY "rdv_policy" ON rendez_vous
  FOR ALL USING (
    commercial_id = auth.uid()
    OR is_my_commercial(commercial_id)
  );

-- adresses_historique : inchangé (tous authentifiés)
-- DROP POLICY IF EXISTS "historique_select" ON adresses_historique;
-- DROP POLICY IF EXISTS "historique_insert" ON adresses_historique;
