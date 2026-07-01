-- Ajoute adresse_numero/nom_voie à dvf_mutations_by_parcelle
-- pour permettre de détecter les ventes d'une adresse différente

DROP FUNCTION IF EXISTS dvf_mutations_by_parcelle(text, integer);

CREATE FUNCTION dvf_mutations_by_parcelle(
  p_id_parcelle text,
  p_annees      int DEFAULT 10
)
RETURNS TABLE (
  id_mutation      text,
  date_mutation    date,
  valeur_fonciere  numeric,
  parcelles        text[],
  locaux           jsonb,
  adresse_numero   text,
  adresse_nom_voie text
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
    MAX(d.date_mutation)                                                        AS date_mutation,
    MAX(d.valeur_fonciere)                                                      AS valeur_fonciere,
    array_agg(DISTINCT d.id_parcelle) FILTER (WHERE d.id_parcelle IS NOT NULL) AS parcelles,
    jsonb_agg(jsonb_build_object(
      'type_local',                d.type_local,
      'surface_reelle_bati',       d.surface_reelle_bati,
      'surface_terrain',           d.surface_terrain,
      'nombre_pieces_principales', d.nombre_pieces_principales
    ) ORDER BY d.type_local NULLS LAST)                                         AS locaux,
    -- Adresse de la vente (ligne avec id_parcelle = p_id_parcelle)
    MAX(d.adresse_numero)   FILTER (WHERE d.id_parcelle = p_id_parcelle)        AS adresse_numero,
    MAX(d.adresse_nom_voie) FILTER (WHERE d.id_parcelle = p_id_parcelle)        AS adresse_nom_voie
  FROM dvf_mutations d
  JOIN mut ON d.id_mutation = mut.id_mutation
  WHERE d.nature_mutation = 'Vente'
  GROUP BY d.id_mutation
  ORDER BY MAX(d.date_mutation) DESC;
$$;
