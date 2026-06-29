-- Retourne les transactions DVF à proximité d'une adresse donnée
-- Rayon 0.002° ≈ 200m (géométrie, utilise l'index GIST)
CREATE OR REPLACE FUNCTION dvf_for_address(
  p_adresse_id text,
  p_annees     int DEFAULT 10
)
RETURNS TABLE (
  id             text,
  date_mutation  date,
  valeur_fonciere numeric,
  type_local     text,
  surface_reelle_bati numeric,
  nature_mutation text,
  distance_metres numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    d.id,
    d.date_mutation,
    d.valeur_fonciere,
    d.type_local,
    d.surface_reelle_bati,
    d.nature_mutation,
    ROUND((ST_Distance(a.geom::geography, d.geom::geography))::numeric, 0) AS distance_metres
  FROM adresses a
  JOIN dvf_mutations d
    ON ST_DWithin(a.geom, d.geom, 0.002)
   AND d.date_mutation >= CURRENT_DATE - (p_annees || ' years')::interval
   AND d.nature_mutation = 'Vente'
  WHERE a.id = p_adresse_id
  ORDER BY d.date_mutation DESC
  LIMIT 50;
$$;
