-- ============================================================
-- PHASE 2 — Zones de prospection (colonnes réelles vérifiées)
-- À exécuter après nettoyage : 
--   DROP TABLE IF EXISTS itineraires_zone;
--   DROP VIEW  IF EXISTS vue_zones_geojson;
-- ============================================================

-- 1. Colonnes manquantes sur zones_prospection
-- (polygone et couleur existent déjà — les autres peuvent manquer)
ALTER TABLE zones_prospection
  ADD COLUMN IF NOT EXISTS polygone  geometry(Polygon, 4326);  -- déjà présent normalement

-- Index spatial
CREATE INDEX IF NOT EXISTS idx_zones_polygone
  ON zones_prospection USING GIST (polygone);

-- 2. Rattacher les adresses à une zone
-- adresses.id est TEXT (identifiant BAN ex: "22168_0440_00003")
ALTER TABLE adresses
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones_prospection(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_adresses_zone_id ON adresses(zone_id);

-- 3. Table itinéraires TSP
CREATE TABLE IF NOT EXISTS itineraires_zone (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     UUID    NOT NULL REFERENCES zones_prospection(id) ON DELETE CASCADE,
  adresse_id  TEXT    NOT NULL REFERENCES adresses(id)          ON DELETE CASCADE,
  ordre       INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (zone_id, adresse_id),
  UNIQUE (zone_id, ordre)
);

ALTER TABLE itineraires_zone ENABLE ROW LEVEL SECURITY;

-- 4. Politiques RLS
-- commerciaux.id = auth.uid() directement

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'itineraires_zone'
      AND policyname = 'Commercial gère ses itinéraires'
  ) THEN
    CREATE POLICY "Commercial gère ses itinéraires"
      ON itineraires_zone FOR ALL
      USING (
        zone_id IN (
          SELECT id FROM zones_prospection
          WHERE commercial_id = auth.uid()
        )
      );
  END IF;
END $$;

ALTER TABLE zones_prospection ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'zones_prospection'
      AND policyname = 'Commercial gère ses zones'
  ) THEN
    CREATE POLICY "Commercial gère ses zones"
      ON zones_prospection FOR ALL
      USING (commercial_id = auth.uid());
  END IF;
END $$;

-- 5. Vue zones en GeoJSON (noms de colonnes réels)
CREATE OR REPLACE VIEW vue_zones_geojson AS
SELECT
  z.id,
  z.commercial_id,
  z.nom,
  z.numero,
  z.couleur,
  z.statut,
  z.capacite_theorique,
  z.nb_adresses,
  z.nb_prospectables,
  z.nb_logements_sociaux,
  CASE
    WHEN z.polygone IS NOT NULL
    THEN ST_AsGeoJSON(z.polygone)::json
    ELSE NULL
  END AS polygone_geojson,
  CASE
    WHEN z.polygone IS NOT NULL
    THEN ST_AsGeoJSON(ST_Centroid(z.polygone))::json
    ELSE NULL
  END AS centroide_geojson
FROM zones_prospection z;

-- 6. Fonction recalcul stats zone (noms de colonnes réels)
CREATE OR REPLACE FUNCTION update_zone_stats(p_zone_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE zones_prospection SET
    nb_adresses = (
      SELECT COUNT(*) FROM adresses WHERE zone_id = p_zone_id
    ),
    nb_prospectables = (
      SELECT COUNT(*) FROM adresses
      WHERE zone_id = p_zone_id
        AND (type_bien IS NULL OR type_bien != 'logement_social')
    ),
    nb_logements_sociaux = (
      SELECT COUNT(*) FROM adresses
      WHERE zone_id = p_zone_id
        AND type_bien = 'logement_social'
    )
  WHERE id = p_zone_id;
END;
$$;
