-- ============================================================
-- Fonction : densité DVF par adresse
--
-- Pour chaque adresse prospectable des communes données, compte
-- le nombre de transactions DVF (Vente Maison/Appartement) dans
-- un rayon de ~200m sur la période p_annees.
--
-- Utilisée par l'algorithme de génération de zones pour pondérer
-- les zones à fort volume de transactions.
-- ============================================================

CREATE OR REPLACE FUNCTION dvf_density_per_address(
  p_codes_insee text[],
  p_annees      int DEFAULT 4
)
RETURNS TABLE (adresse_id text, nb_dvf int)
LANGUAGE sql STABLE AS $$
  SELECT
    a.id             AS adresse_id,
    COUNT(d.id)::int AS nb_dvf
  FROM adresses a
  JOIN dvf_mutations d
    ON ST_DWithin(a.geom, d.geom, 0.002)
   AND d.date_mutation   >= CURRENT_DATE - (p_annees || ' years')::interval
   AND d.type_local       IN ('Maison', 'Appartement')
   AND d.nature_mutation  = 'Vente'
  WHERE a.code_insee = ANY(p_codes_insee)
    AND a.prospectable = true
  GROUP BY a.id
  HAVING COUNT(d.id) > 0;
$$;
