-- ============================================================
-- Enrichissement adresses ← id_parcelle cadastrale (DVF)
-- Stratégie :
--   1. Correspondance exacte par adresse texte + commune
--   2. Fallback : DVF le plus proche dans un rayon de 30m
-- ============================================================

-- 1. Ajouter la colonne si elle n'existe pas encore
ALTER TABLE adresses
  ADD COLUMN IF NOT EXISTS id_parcelle text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_adresses_id_parcelle
  ON adresses (id_parcelle) WHERE id_parcelle IS NOT NULL;

-- 2. Enrichissement par correspondance textuelle
--    On normalise les noms de voie en minuscules sans accents pour la comparaison
UPDATE adresses a
SET id_parcelle = sub.id_parcelle
FROM (
  SELECT DISTINCT ON (a2.id)
    a2.id,
    d.id_parcelle
  FROM adresses a2
  JOIN dvf_mutations d
    ON d.code_commune = a2.code_insee
   AND d.adresse_numero = a2.numero
   AND lower(unaccent(d.adresse_nom_voie)) = lower(unaccent(a2.nom_voie))
   AND d.id_parcelle IS NOT NULL
   AND d.nature_mutation = 'Vente'
  WHERE a2.id_parcelle IS NULL
  ORDER BY a2.id, d.date_mutation DESC
) sub
WHERE a.id = sub.id;

-- 3. Fallback géographique pour les adresses sans correspondance texte
--    On prend le DVF le plus proche dans un rayon de 30m (geometry, plus rapide)
UPDATE adresses a
SET id_parcelle = sub.id_parcelle
FROM (
  SELECT DISTINCT ON (a2.id)
    a2.id,
    d.id_parcelle
  FROM adresses a2
  JOIN dvf_mutations d
    ON d.code_commune = a2.code_insee
   AND d.id_parcelle IS NOT NULL
   AND d.nature_mutation = 'Vente'
   AND ST_DWithin(a2.geom, d.geom, 0.00027)
  WHERE a2.id_parcelle IS NULL
    AND a2.geom IS NOT NULL
    AND d.geom IS NOT NULL
  ORDER BY a2.id, ST_Distance(a2.geom, d.geom) ASC
) sub
WHERE a.id = sub.id;

-- ============================================================
-- Mise à jour de dvf_for_address pour utiliser id_parcelle
-- en priorité quand disponible, puis proximité géo en fallback
-- ============================================================
DROP FUNCTION IF EXISTS dvf_for_address(text, integer);

CREATE FUNCTION dvf_for_address(
  p_adresse_id text,
  p_annees     int DEFAULT 10
)
RETURNS TABLE (
  id                  text,
  date_mutation       date,
  valeur_fonciere     numeric,
  type_local          text,
  surface_reelle_bati numeric,
  nature_mutation     text,
  distance_metres     numeric,
  via_parcelle        boolean
)
LANGUAGE sql STABLE AS $$
  -- Résultats via id_parcelle (priorité, correspondance exacte)
  SELECT
    d.id::text,
    d.date_mutation,
    d.valeur_fonciere,
    d.type_local,
    d.surface_reelle_bati,
    d.nature_mutation,
    ROUND(COALESCE(ST_Distance(a.geom::geography, d.geom::geography), 0)::numeric, 0),
    true
  FROM adresses a
  JOIN dvf_mutations d
    ON d.id_parcelle = a.id_parcelle
   AND d.date_mutation >= CURRENT_DATE - (p_annees || ' years')::interval
   AND d.nature_mutation = 'Vente'
  WHERE a.id = p_adresse_id
    AND a.id_parcelle IS NOT NULL

  UNION ALL

  -- Résultats via proximité géo (fallback si pas d'id_parcelle)
  SELECT
    d.id::text,
    d.date_mutation,
    d.valeur_fonciere,
    d.type_local,
    d.surface_reelle_bati,
    d.nature_mutation,
    ROUND(ST_Distance(a.geom::geography, d.geom::geography)::numeric, 0),
    false
  FROM adresses a
  JOIN dvf_mutations d
    ON ST_DWithin(a.geom, d.geom, 0.002)
   AND d.date_mutation >= CURRENT_DATE - (p_annees || ' years')::interval
   AND d.nature_mutation = 'Vente'
  WHERE a.id = p_adresse_id
    AND a.id_parcelle IS NULL
    AND a.geom IS NOT NULL

  ORDER BY date_mutation DESC
  LIMIT 50;
$$;
