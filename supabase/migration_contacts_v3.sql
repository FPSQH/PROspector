-- ============================================================
-- PROspector — Migration contacts v3
-- DESCRIPTION : Ajoute les colonnes adresse enrichie + horizon
--               qualifié sur la table contacts.
--
-- À EXÉCUTER dans Supabase SQL Editor (une seule fois).
-- Idempotente (ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── 1. Colonnes adresse libre / coordonnées ───────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS adresse_libre  TEXT,
  ADD COLUMN IF NOT EXISTS adresse_lat    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS adresse_lon    DOUBLE PRECISION;

-- ── 2. Lien vers la zone de prospection ──────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS zone_id  UUID REFERENCES zones_prospection(id) ON DELETE SET NULL;

-- ── 3. Horizon qualifié + échéance calculée ───────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS horizon_qualification_date  DATE,
  ADD COLUMN IF NOT EXISTS horizon_echeance_date       DATE;

-- ── 4. Index performances ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_zone_id
  ON contacts(commercial_id, zone_id)
  WHERE zone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_horizon_echeance
  ON contacts(commercial_id, horizon_echeance_date)
  WHERE horizon_echeance_date IS NOT NULL;

-- ── 5. Vérification finale ─────────────────────────────────────────────
SELECT
  'Migration contacts v3 OK' AS statut,
  COUNT(*)                                                          AS nb_contacts,
  COUNT(adresse_libre)    FILTER (WHERE adresse_libre IS NOT NULL)  AS avec_adresse_libre,
  COUNT(zone_id)          FILTER (WHERE zone_id       IS NOT NULL)  AS avec_zone,
  COUNT(horizon_echeance_date) FILTER (WHERE horizon_echeance_date IS NOT NULL) AS avec_echeance
FROM contacts;
