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


-- ══════════════════════════════════════════════════════════════════
-- MIGRATION DPE — Moteur DPE unifié (toutes communes de France)
-- À exécuter une seule fois sur tout nouveau Supabase
-- ══════════════════════════════════════════════════════════════════

-- 1. Colonnes enrichies sur dpe_logement
ALTER TABLE dpe_logement
  ADD COLUMN IF NOT EXISTS lat                FLOAT,
  ADD COLUMN IF NOT EXISTS lon                FLOAT,
  ADD COLUMN IF NOT EXISTS date_modification  DATE,
  ADD COLUMN IF NOT EXISTS date_fin_validite  DATE,
  ADD COLUMN IF NOT EXISTS has_audit          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_n            TEXT,
  ADD COLUMN IF NOT EXISTS audit_date         DATE,
  ADD COLUMN IF NOT EXISTS audit_scenarios    JSONB,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

-- 2. Corriger la contrainte match_confiance pour inclure gps_50m
ALTER TABLE dpe_logement
  DROP CONSTRAINT IF EXISTS dpe_logement_match_confiance_check;
ALTER TABLE dpe_logement
  ADD CONSTRAINT dpe_logement_match_confiance_check
  CHECK (match_confiance IN ('non_matche','gps_50m','voie','textuel_exact','spatial_proche'));

-- 3. Colonnes sur communes
ALTER TABLE communes
  ADD COLUMN IF NOT EXISTS derniere_verif_dpe TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nb_dpe             INTEGER DEFAULT 0;

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_dpe_geom             ON dpe_logement USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_dpe_lat_lon          ON dpe_logement (lat, lon) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dpe_code_insee       ON dpe_logement (code_insee);
CREATE INDEX IF NOT EXISTS idx_dpe_date_etab        ON dpe_logement (date_etablissement DESC);
CREATE INDEX IF NOT EXISTS idx_dpe_date_modif       ON dpe_logement (date_modification DESC);
CREATE INDEX IF NOT EXISTS idx_dpe_etiquette        ON dpe_logement (etiquette_dpe);
CREATE INDEX IF NOT EXISTS idx_dpe_has_audit        ON dpe_logement (has_audit) WHERE has_audit = true;
CREATE INDEX IF NOT EXISTS idx_adresses_geom        ON adresses USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_adresses_latest_dpe  ON adresses (latest_dpe_date) WHERE latest_dpe_date IS NOT NULL;

-- 5. Trigger geom automatique depuis lat/lon
CREATE OR REPLACE FUNCTION fill_dpe_geom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lon IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fill_dpe_geom ON dpe_logement;
CREATE TRIGGER trg_fill_dpe_geom
  BEFORE INSERT OR UPDATE OF lat, lon ON dpe_logement
  FOR EACH ROW EXECUTE FUNCTION fill_dpe_geom();

-- 6. Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_dpe_updated_at ON dpe_logement;
CREATE TRIGGER trg_dpe_updated_at
  BEFORE UPDATE ON dpe_logement
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Fonction matching GPS 50m (générique — valable pour toute commune de France)
CREATE OR REPLACE FUNCTION match_dpe_to_adresses(p_code_insee TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE nb_matched INTEGER := 0;
BEGIN
  UPDATE dpe_logement d
  SET adresse_id      = matched.adresse_id,
      match_confiance = 'gps_50m'
  FROM (
    SELECT DISTINCT ON (d2.id)
      d2.id  AS dpe_id,
      a2.id  AS adresse_id
    FROM dpe_logement d2
    JOIN adresses a2
      ON  a2.code_insee = p_code_insee
      AND d2.geom IS NOT NULL
      AND a2.geom IS NOT NULL
      AND ST_DWithin(d2.geom::geography, a2.geom::geography, 50)
    WHERE d2.code_insee     = p_code_insee
      AND d2.match_confiance = 'non_matche'
    ORDER BY d2.id, ST_Distance(d2.geom::geography, a2.geom::geography)
  ) matched
  WHERE d.id = matched.dpe_id;

  GET DIAGNOSTICS nb_matched = ROW_COUNT;

  -- Propager latest_dpe_date vers adresses
  UPDATE adresses a
  SET latest_dpe_date = sub.max_date
  FROM (
    SELECT adresse_id, MAX(date_etablissement) AS max_date
    FROM dpe_logement
    WHERE code_insee = p_code_insee AND adresse_id IS NOT NULL
    GROUP BY adresse_id
  ) sub
  WHERE a.id::text = sub.adresse_id::text;

  -- Mettre à jour nb_dpe sur communes
  UPDATE communes
  SET nb_dpe = (SELECT COUNT(*) FROM dpe_logement WHERE code_insee = p_code_insee)
  WHERE code_insee = p_code_insee;

  RETURN nb_matched;
END;
$$;

-- 8. Fonction propagate_dpe_dates (compatibilité)
CREATE OR REPLACE FUNCTION propagate_dpe_dates(p_code_insee TEXT)
RETURNS void LANGUAGE sql AS $$
  UPDATE adresses a
  SET latest_dpe_date = d.date_etablissement
  FROM (
    SELECT DISTINCT ON (adresse_id) adresse_id, date_etablissement
    FROM dpe_logement
    WHERE code_insee = p_code_insee
      AND adresse_id IS NOT NULL
      AND date_etablissement IS NOT NULL
    ORDER BY adresse_id, date_etablissement DESC
  ) d
  WHERE a.id::text = d.adresse_id::text;
$$;

-- 9. Vue matérialisée stats par commune
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dpe_stats_commune AS
SELECT
  code_insee,
  COUNT(*)                                         AS nb_total,
  COUNT(*) FILTER (WHERE etiquette_dpe = 'A')      AS nb_a,
  COUNT(*) FILTER (WHERE etiquette_dpe = 'B')      AS nb_b,
  COUNT(*) FILTER (WHERE etiquette_dpe = 'C')      AS nb_c,
  COUNT(*) FILTER (WHERE etiquette_dpe = 'D')      AS nb_d,
  COUNT(*) FILTER (WHERE etiquette_dpe = 'E')      AS nb_e,
  COUNT(*) FILTER (WHERE etiquette_dpe = 'F')      AS nb_f,
  COUNT(*) FILTER (WHERE etiquette_dpe = 'G')      AS nb_g,
  COUNT(*) FILTER (WHERE has_audit = true)         AS nb_avec_audit,
  MAX(date_etablissement)                          AS dernier_dpe,
  MAX(date_modification)                           AS derniere_modif
FROM dpe_logement
GROUP BY code_insee
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dpe_stats_commune ON mv_dpe_stats_commune (code_insee);

SELECT 'Migration DPE moteur unifié OK' AS statut;
