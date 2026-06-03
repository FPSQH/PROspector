-- ══════════════════════════════════════════════════════════════════
-- Passe 3 : matching BDNB par texte d'adresse
--
-- Compare numero + nom_voie (BAN) avec libelle_adr_principale_ban (BDNB)
-- après normalisation (minuscules, sans accents).
--
-- Exemple :
--   BAN  : numero="12"  nom_voie="Impasse de Kerbiriou"
--   BDNB : libelle_adr_principale_ban="12 IMPASSE DE KERBIRIOU 22450 COATREVEN"
--   → normalized BAN  : "12 impasse de kerbiriou"
--   → normalized BDNB : "12 impasse de kerbiriou 22450 coatreven"
--   → BDNB starts with BAN → MATCH ✓
--
-- Prérequis : CREATE EXTENSION IF NOT EXISTS unaccent;
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION match_bdnb_by_address_text(p_code_insee TEXT)
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  SET LOCAL row_security = off;
  UPDATE adresses a
  SET batiment_groupe_id = (
    SELECT b.batiment_groupe_id
    FROM bdnb_batiment_groupe b
    WHERE b.code_commune_insee = p_code_insee
      AND b.libelle_adr_principale_ban IS NOT NULL
      AND lower(unaccent(b.libelle_adr_principale_ban)) LIKE
          lower(unaccent(a.numero || ' ' || a.nom_voie)) || '%'
    LIMIT 1
  )
  WHERE a.code_insee = p_code_insee
    AND a.batiment_groupe_id IS NULL
    AND a.numero IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
