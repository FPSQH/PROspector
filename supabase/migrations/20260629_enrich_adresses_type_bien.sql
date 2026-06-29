-- ============================================================
-- Fonction : qualifier type_bien des adresses depuis DVF
--
-- Matching spatial (≤15m) entre adresses.geom et dvf_mutations.geom.
-- Ne touche que les adresses avec type_bien = 'inconnu' pour préserver
-- les qualifications manuelles ou issues d'autres sources (BDNB, etc.).
--
-- Appelée :
--   1. En fin d'ingestion BAN (nouvelles adresses d'une commune)
--   2. En fin d'ingestion DVF (nouvelles mutations disponibles)
--
-- Paramètre :
--   p_codes_insee  text[]  Filtre sur communes (NULL = toutes communes)
-- ============================================================

CREATE OR REPLACE FUNCTION enrich_adresses_type_bien(
  p_codes_insee text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer;
BEGIN
  WITH best_dvf AS (
    SELECT DISTINCT ON (a.id)
      a.id AS adresse_id,
      CASE d.type_local
        WHEN 'Maison'                                   THEN 'maison'
        WHEN 'Appartement'                              THEN 'appartement'
        WHEN 'Local industriel. commercial ou assimilé' THEN 'commerce'
      END AS type_bien_dvf
    FROM adresses a
    JOIN dvf_mutations d
      ON ST_DWithin(a.geom::geography, d.geom::geography, 15)
    WHERE a.type_bien = 'inconnu'
      AND (p_codes_insee IS NULL OR a.code_insee = ANY(p_codes_insee))
      AND d.type_local IN ('Maison', 'Appartement', 'Local industriel. commercial ou assimilé')
      AND d.geom IS NOT NULL
    ORDER BY a.id, d.date_mutation DESC NULLS LAST
  )
  UPDATE adresses a
  SET
    type_bien  = b.type_bien_dvf,
    updated_at = now()
  FROM best_dvf b
  WHERE a.id = b.adresse_id
    AND b.type_bien_dvf IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
