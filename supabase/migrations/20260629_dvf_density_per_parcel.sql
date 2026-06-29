-- Densité DVF agrégée par parcelle cadastrale
-- Utilisée pour colorier les parcelles sur la carte Explorer
CREATE OR REPLACE FUNCTION dvf_density_per_parcel(
  p_codes_insee text[],
  p_annees      int DEFAULT 5
)
RETURNS TABLE (
  id_parcelle    text,
  nb_ventes      int,
  valeur_moyenne numeric,
  derniere_vente date
)
LANGUAGE sql STABLE AS $$
  SELECT
    id_parcelle,
    COUNT(DISTINCT id_mutation)::int           AS nb_ventes,
    AVG(valeur_fonciere)::numeric              AS valeur_moyenne,
    MAX(date_mutation)                         AS derniere_vente
  FROM dvf_mutations
  WHERE code_commune = ANY(p_codes_insee)
    AND id_parcelle IS NOT NULL
    AND date_mutation >= CURRENT_DATE - (p_annees || ' years')::interval
    AND nature_mutation = 'Vente'
  GROUP BY id_parcelle;
$$;
