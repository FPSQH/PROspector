-- ══════════════════════════════════════════════════════════════════
-- Pass 4 : match via l_libelle_adr JSONB array
--   Certains bâtiments BDNB ont plusieurs adresses dans l_libelle_adr
--   La passe 3 ne cherche que dans libelle_adr_principale_ban
--   Cette passe cherche dans toutes les adresses du tableau JSON
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION match_bdnb_by_libelle_array(p_code_insee TEXT)
RETURNS TABLE(matched INT) LANGUAGE plpgsql AS $$
DECLARE
  v_matched INT := 0;
BEGIN
  UPDATE adresses a
  SET batiment_groupe_id = (
    SELECT b.batiment_groupe_id
    FROM bdnb_batiment_groupe b,
         jsonb_array_elements_text(
           CASE
             WHEN b.l_libelle_adr IS NULL THEN '[]'::jsonb
             WHEN jsonb_typeof(b.l_libelle_adr) = 'array' THEN b.l_libelle_adr
             ELSE '[]'::jsonb
           END
         ) AS lbl
    WHERE b.code_commune_insee = p_code_insee
      AND lower(unaccent(lbl)) LIKE lower(unaccent(
            COALESCE(a.numero || ' ', '') || a.nom_voie
          )) || '%'
    LIMIT 1
  )
  WHERE a.code_insee = p_code_insee
    AND a.batiment_groupe_id IS NULL
    AND a.nom_voie IS NOT NULL;

  GET DIAGNOSTICS v_matched = ROW_COUNT;
  RETURN QUERY SELECT v_matched;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- Pass 5 : lieu-dit matching
--   Adresses sans numéro (hameaux, lieux-dits) : on cherche dans
--   libelle_adr_principale_ban OU l_libelle_adr le nom du lieu-dit
--   Seulement si le rapprochement est unique dans la commune
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION match_bdnb_by_lieu_dit(p_code_insee TEXT)
RETURNS TABLE(matched INT) LANGUAGE plpgsql AS $$
DECLARE
  v_matched INT := 0;
BEGIN
  UPDATE adresses a
  SET batiment_groupe_id = (
    -- Cherche le bâtiment BDNB dont le libellé principal contient le nom du lieu-dit
    SELECT b.batiment_groupe_id
    FROM bdnb_batiment_groupe b
    WHERE b.code_commune_insee = p_code_insee
      AND b.libelle_adr_principale_ban IS NOT NULL
      AND lower(unaccent(b.libelle_adr_principale_ban)) LIKE '%' || lower(unaccent(a.nom_voie)) || '%'
    LIMIT 1
  )
  WHERE a.code_insee = p_code_insee
    AND a.batiment_groupe_id IS NULL
    AND a.numero IS NULL
    AND a.nom_voie IS NOT NULL
    -- Seulement si exactement 1 bâtiment BDNB correspond (évite les ambiguïtés)
    AND (
      SELECT COUNT(DISTINCT b2.batiment_groupe_id)
      FROM bdnb_batiment_groupe b2
      WHERE b2.code_commune_insee = p_code_insee
        AND b2.libelle_adr_principale_ban IS NOT NULL
        AND lower(unaccent(b2.libelle_adr_principale_ban)) LIKE '%' || lower(unaccent(a.nom_voie)) || '%'
    ) = 1;

  GET DIAGNOSTICS v_matched = ROW_COUNT;
  RETURN QUERY SELECT v_matched;
END;
$$;
