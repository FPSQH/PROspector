-- ============================================================
-- DVF Mutations – Demandes de Valeurs Foncières géolocalisées
-- Source : https://tabular-api.data.gouv.fr (data.gouv.fr)
-- ============================================================

CREATE TABLE IF NOT EXISTS dvf_mutations (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identifiants DVF
  id_mutation             text        NOT NULL,
  id_parcelle             text,                         -- identifiant cadastral (14 chars)

  -- Mutation
  date_mutation           date        NOT NULL,
  nature_mutation         text,                         -- 'Vente', 'Adjudication', 'Expropriation'…
  valeur_fonciere         numeric,

  -- Localisation
  adresse_numero          text,
  adresse_suffixe         text,
  adresse_nom_voie        text,
  code_postal             text,
  code_commune            text        NOT NULL,          -- code INSEE
  nom_commune             text,
  code_departement        text,

  -- Local (un local par ligne dans DVF géolocalisé)
  type_local              text,                         -- 'Appartement','Maison','Dépendance','Local industriel…'
  surface_reelle_bati     numeric,
  nombre_pieces_principales integer,
  surface_terrain         numeric,

  -- Géolocalisation
  longitude               double precision,
  latitude                double precision,
  geom                    geometry(Point, 4326),

  -- Métadonnées
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  -- Un (mutation + type_local + parcelle) = une ligne
  CONSTRAINT dvf_mutations_uniq UNIQUE (id_mutation, type_local, id_parcelle)
);

-- Index géographique et fonctionnels
CREATE INDEX IF NOT EXISTS idx_dvf_geom          ON dvf_mutations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_dvf_code_commune  ON dvf_mutations (code_commune);
CREATE INDEX IF NOT EXISTS idx_dvf_date_mutation ON dvf_mutations (date_mutation DESC);
CREATE INDEX IF NOT EXISTS idx_dvf_type_local    ON dvf_mutations (type_local);
CREATE INDEX IF NOT EXISTS idx_dvf_parcelle      ON dvf_mutations (id_parcelle) WHERE id_parcelle IS NOT NULL;

-- Trigger : remplir geom depuis lat/lon
CREATE OR REPLACE FUNCTION fill_dvf_geom()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.longitude IS NOT NULL AND NEW.latitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_dvf_geom ON dvf_mutations;
CREATE TRIGGER trg_fill_dvf_geom
  BEFORE INSERT OR UPDATE OF longitude, latitude ON dvf_mutations
  FOR EACH ROW EXECUTE FUNCTION fill_dvf_geom();

-- Trigger : updated_at
CREATE OR REPLACE FUNCTION set_dvf_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dvf_updated_at ON dvf_mutations;
CREATE TRIGGER trg_dvf_updated_at
  BEFORE UPDATE ON dvf_mutations
  FOR EACH ROW EXECUTE FUNCTION set_dvf_updated_at();

-- RLS : lecture uniquement via les routes API (service role pour l'ingestion)
ALTER TABLE dvf_mutations ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur authentifié peut lire les DVF (données publiques)
CREATE POLICY "dvf_select_authenticated"
  ON dvf_mutations FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Colonne de suivi d'ingestion DVF sur la table communes
-- ============================================================
ALTER TABLE communes
  ADD COLUMN IF NOT EXISTS derniere_verif_dvf  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nb_dvf              integer     DEFAULT 0;

-- ============================================================
-- Fonction : stats DVF pour une liste de communes (par secteur)
-- ============================================================
CREATE OR REPLACE FUNCTION dvf_stats_communes(p_codes_insee text[])
RETURNS TABLE (
  code_commune          text,
  nb_transactions       bigint,
  prix_median_m2        numeric,
  prix_moyen_m2         numeric,
  prix_median_maison    numeric,
  prix_median_appart    numeric,
  surface_mediane_bati  numeric,
  annee_min             int,
  annee_max             int
) LANGUAGE sql STABLE AS $$
  SELECT
    code_commune,
    COUNT(*)                                                                AS nb_transactions,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valeur_fonciere / NULLIF(surface_reelle_bati, 0))::numeric, 0)
                                                                            AS prix_median_m2,
    ROUND(AVG(valeur_fonciere / NULLIF(surface_reelle_bati, 0))::numeric, 0)
                                                                            AS prix_moyen_m2,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
      CASE WHEN type_local = 'Maison' THEN valeur_fonciere / NULLIF(surface_reelle_bati, 0) END
    )::numeric, 0)                                                          AS prix_median_maison,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
      CASE WHEN type_local = 'Appartement' THEN valeur_fonciere / NULLIF(surface_reelle_bati, 0) END
    )::numeric, 0)                                                          AS prix_median_appart,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY surface_reelle_bati)::numeric, 1)
                                                                            AS surface_mediane_bati,
    MIN(EXTRACT(YEAR FROM date_mutation))::int                              AS annee_min,
    MAX(EXTRACT(YEAR FROM date_mutation))::int                              AS annee_max
  FROM dvf_mutations
  WHERE code_commune = ANY(p_codes_insee)
    AND nature_mutation = 'Vente'
    AND valeur_fonciere > 0
    AND surface_reelle_bati > 0
    AND type_local IN ('Appartement', 'Maison')
  GROUP BY code_commune;
$$;

-- ============================================================
-- Fonction : stats DVF dans un polygone de zone
-- ============================================================
CREATE OR REPLACE FUNCTION dvf_stats_zone(p_zone_id uuid)
RETURNS TABLE (
  nb_transactions       bigint,
  prix_median_m2        numeric,
  prix_moyen_m2         numeric,
  prix_median_maison    numeric,
  prix_median_appart    numeric,
  surface_mediane_bati  numeric,
  nb_maisons            bigint,
  nb_appartements       bigint,
  annee_min             int,
  annee_max             int
) LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*)                                                                AS nb_transactions,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valeur_fonciere / NULLIF(surface_reelle_bati, 0))::numeric, 0)
                                                                            AS prix_median_m2,
    ROUND(AVG(valeur_fonciere / NULLIF(surface_reelle_bati, 0))::numeric, 0)
                                                                            AS prix_moyen_m2,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
      CASE WHEN type_local = 'Maison' THEN valeur_fonciere / NULLIF(surface_reelle_bati, 0) END
    )::numeric, 0)                                                          AS prix_median_maison,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
      CASE WHEN type_local = 'Appartement' THEN valeur_fonciere / NULLIF(surface_reelle_bati, 0) END
    )::numeric, 0)                                                          AS prix_median_appart,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY surface_reelle_bati)::numeric, 1)
                                                                            AS surface_mediane_bati,
    COUNT(*) FILTER (WHERE type_local = 'Maison')                          AS nb_maisons,
    COUNT(*) FILTER (WHERE type_local = 'Appartement')                     AS nb_appartements,
    MIN(EXTRACT(YEAR FROM date_mutation))::int                              AS annee_min,
    MAX(EXTRACT(YEAR FROM date_mutation))::int                              AS annee_max
  FROM dvf_mutations d
  JOIN zones_prospection z ON z.id = p_zone_id
  WHERE ST_Within(d.geom, z.polygone)
    AND nature_mutation = 'Vente'
    AND valeur_fonciere > 0
    AND surface_reelle_bati > 0
    AND type_local IN ('Appartement', 'Maison');
$$;
