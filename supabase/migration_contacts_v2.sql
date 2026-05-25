-- ============================================================
-- PROspector — Migration contacts v2
-- DESCRIPTION : Ajoute les colonnes CRM manquantes sur la table contacts
--               et corrige les contraintes CHECK pour correspondre
--               exactement aux valeurs utilisées par le code.
--
-- À EXÉCUTER dans Supabase SQL Editor (une seule fois).
-- Cette migration est idempotente (ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── 1. Colonnes manquantes ─────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS nom             TEXT,
  ADD COLUMN IF NOT EXISTS tel1            TEXT,
  ADD COLUMN IF NOT EXISTS tel2            TEXT,
  ADD COLUMN IF NOT EXISTS email1          TEXT,
  ADD COLUMN IF NOT EXISTS email2          TEXT,
  ADD COLUMN IF NOT EXISTS interaction_id  UUID REFERENCES interactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS date_relance    DATE,
  ADD COLUMN IF NOT EXISTS statut_pipeline TEXT DEFAULT 'prospect';

-- ── 2. Contrainte type_contact — valeurs réelles du code ──────────────
-- Supprime l'ancienne contrainte qui avait 'projet_moyen_terme' au lieu
-- de 'projet_moyen' et 'projet_long' séparés.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_type_contact_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_type_contact_check
  CHECK (type_contact IS NULL OR type_contact IN (
    'interet_vente', 'projet_moyen', 'projet_long',
    'voisin_relais', 'recommandation', 'commercant', 'autre'
  ));

-- ── 3. Contrainte horizon_vente — valeurs réelles du code ─────────────
-- Supprime l'ancienne contrainte ('immediat','3_mois','6_mois','1_an','plus')
-- et la remplace par les valeurs réellement utilisées.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_horizon_vente_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_horizon_vente_check
  CHECK (horizon_vente IS NULL OR horizon_vente IN (
    'moins_6_mois', '6_12_mois', '1_2_ans', 'plus_2_ans'
  ));

-- ── 4. Contrainte statut_pipeline ─────────────────────────────────────
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_statut_pipeline_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_statut_pipeline_check
  CHECK (statut_pipeline IS NULL OR statut_pipeline IN (
    'prospect', 'qualification', 'estimation', 'mandat', 'perdu'
  ));

-- ── 5. Trigger updated_at (idempotent) ────────────────────────────────
CREATE OR REPLACE FUNCTION set_contacts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_contacts_updated_at();

-- ── 6. Index performances ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_commercial_updated
  ON contacts(commercial_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_date_relance
  ON contacts(commercial_id, date_relance)
  WHERE date_relance IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_statut_pipeline
  ON contacts(commercial_id, statut_pipeline);

-- ── 7. Vérification finale ─────────────────────────────────────────────
SELECT
  'Migration contacts v2 OK' AS statut,
  COUNT(*) AS nb_contacts_existants,
  COUNT(nom)             FILTER (WHERE nom IS NOT NULL)             AS avec_nom,
  COUNT(tel1)            FILTER (WHERE tel1 IS NOT NULL)            AS avec_tel,
  COUNT(statut_pipeline) FILTER (WHERE statut_pipeline IS NOT NULL) AS avec_statut
FROM contacts;
