-- ══════════════════════════════════════════════════════════════════
-- Passe 3 : matching BDNB par texte d'adresse
--
-- Compare numero + nom_voie (BAN) avec libelle_adr_principale_ban (BDNB)
-- après normalisation (minuscules, sans accents, espaces réduits).
--
-- Exemple :
--   BAN  : numero="12"  nom_voie="Impasse de Kerbiriou"
--   BDNB : libelle_adr_principale_ban="12 IMPASSE DE KERBIRIOU 22450 COATREVEN"
--   → normalized BAN  : "12 impasse de kerbiriou"
--   → normalized BDNB : "12 impasse de kerbiriou 22450 coatreven"
--   → BDNB starts with BAN → MATCH ✓
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_bdnb_by_address_text(p_code_insee TEXT)
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  SET LOCAL row_security = off;
  UPDATE adresses a
  SET batiment_groupe_id = b.batiment_groupe_id
  FROM (
    -- One address can match multiple BDNB buildings (e.g. split lots) — keep closest
    SELECT DISTINCT ON (a2.id)
      a2.id AS adresse_id,
      b.batiment_groupe_id
    FROM adresses a2
    JOIN bdnb_batiment_groupe b ON b.code_commune_insee = p_code_insee
    WHERE a2.code_insee = p_code_insee
      AND a2.batiment_groupe_id IS NULL
      AND a2.numero IS NOT NULL
      AND b.libelle_adr_principale_ban IS NOT NULL
      AND lower(unaccent(b.libelle_adr_principale_ban)) LIKE
          lower(unaccent(a2.numero || ' ' || a2.nom_voie)) || '%'
    ORDER BY a2.id, ST_Distance(
      a2.geom::geography,
      COALESCE(b.geom_centre, ST_SetSRID(ST_MakePoint(b.lon_centre, b.lat_centre), 4326))::geography
    )
  ) sub
  WHERE a.id = sub.adresse_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
