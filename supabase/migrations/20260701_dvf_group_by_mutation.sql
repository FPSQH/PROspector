-- ============================================================
-- DVF : regroupement par mutation + fonction parcelle
-- ============================================================

-- 1. Mise à jour dvf_for_address : ajoute id_mutation dans le retour
DROP FUNCTION IF EXISTS dvf_for_address(text, integer);

CREATE FUNCTION dvf_for_address(
  p_adresse_id text,
  p_annees     int DEFAULT 10
)
RETURNS TABLE (
  id                  text,
  id_mutation         text,
  date_mutation       date,
  valeur_fonciere     numeric,
  type_local          text,
  surface_reelle_bati numeric,
  surface_terrain     numeric,
  nombre_pieces       integer,
  nature_mutation     text,
  distance_metres     numeric,
  via_parcelle        boolean
)
LANGUAGE sql STABLE AS $$
  SELECT
    d.id::text, d.id_mutation, d.date_mutation, d.valeur_fonciere, d.type_local,
    d.surface_reelle_bati, d.surface_terrain, d.nombre_pieces_principales,
    d.nature_mutation,
    ROUND(COALESCE(ST_Distance(a.geom::geography, d.geom::geography), 0)::numeric, 0),
    true
  FROM adresses a
  JOIN dvf_mutations d
    ON d.id_parcelle = a.id_parcelle
   AND d.date_mutation >= CURRENT_DATE - (p_annees || ' years')::interval
   AND d.nature_mutation = 'Vente'
  WHERE a.id = p_adresse_id AND a.id_parcelle IS NOT NULL

  UNION ALL

  SELECT
    d.id::text, d.id_mutation, d.date_mutation, d.valeur_fonciere, d.type_local,
    d.surface_reelle_bati, d.surface_terrain, d.nombre_pieces_principales,
    d.nature_mutation,
    ROUND(ST_Distance(a.geom::geography, d.geom::geography)::numeric, 0),
    false
  FROM adresses a
  JOIN dvf_mutations d
    ON ST_DWithin(a.geom, d.geom, 0.002)
   AND d.date_mutation >= CURRENT_DATE - (p_annees || ' years')::interval
   AND d.nature_mutation = 'Vente'
  WHERE a.id = p_adresse_id AND a.id_parcelle IS NULL AND a.geom IS NOT NULL

  ORDER BY date_mutation DESC
  LIMIT 80;
$$;

-- 2. Nouvelle fonction : mutations d'une parcelle, regroupées par id_mutation
CREATE OR REPLACE FUNCTION dvf_mutations_by_parcelle(
  p_id_parcelle text,
  p_annees      int DEFAULT 10
)
RETURNS TABLE (
  id_mutation     text,
  date_mutation   date,
  valeur_fonciere numeric,
  parcelles       text[],
  locaux          jsonb
)
LANGUAGE sql STABLE AS $$
  WITH mut AS (
    SELECT DISTINCT id_mutation
    FROM dvf_mutations
    WHERE id_parcelle = p_id_parcelle
      AND nature_mutation = 'Vente'
      AND date_mutation >= CURRENT_DATE - (p_annees || ' years')::interval
  )
  SELECT
    d.id_mutation,
    MAX(d.date_mutation)                                                          AS date_mutation,
    MAX(d.valeur_fonciere)                                                        AS valeur_fonciere,
    array_agg(DISTINCT d.id_parcelle) FILTER (WHERE d.id_parcelle IS NOT NULL)   AS parcelles,
    jsonb_agg(jsonb_build_object(
      'type_local',                d.type_local,
      'surface_reelle_bati',       d.surface_reelle_bati,
      'surface_terrain',           d.surface_terrain,
      'nombre_pieces_principales', d.nombre_pieces_principales
    ) ORDER BY d.type_local NULLS LAST)                                           AS locaux
  FROM dvf_mutations d
  JOIN mut ON d.id_mutation = mut.id_mutation
  WHERE d.nature_mutation = 'Vente'
  GROUP BY d.id_mutation
  ORDER BY MAX(d.date_mutation) DESC;
$$;
