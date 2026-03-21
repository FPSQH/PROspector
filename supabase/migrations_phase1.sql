-- ============================================================
-- PROspector – Migrations Phase 1
-- À exécuter dans Supabase SQL Editor après schema.sql
-- ============================================================

-- Index supplémentaires pour les performances de la carte secteur
CREATE INDEX IF NOT EXISTS adresses_prospectable_idx ON adresses(prospectable);
CREATE INDEX IF NOT EXISTS communes_commercial_chargee_idx ON communes(commercial_id, chargee_at);

-- Fonction RPC pour récupérer les adresses d'un secteur (toutes communes d'un commercial)
-- Plus performant qu'un filtre IN côté client sur de grands volumes
CREATE OR REPLACE FUNCTION get_adresses_secteur(p_commercial_id UUID)
RETURNS TABLE (
  id TEXT, code_insee TEXT, numero TEXT, nom_voie TEXT,
  code_postal TEXT, commune TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
  type_bien TEXT, nb_bal INTEGER, prospectable BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    a.id, a.code_insee, a.numero, a.nom_voie,
    a.code_postal, a.commune, a.lat, a.lon,
    a.type_bien, a.nb_bal, a.prospectable
  FROM adresses a
  INNER JOIN communes c ON c.code_insee = a.code_insee
  WHERE c.commercial_id = p_commercial_id
    AND c.chargee_at IS NOT NULL
  ORDER BY a.commune, a.nom_voie, a.numero;
$$;

-- Fonction RPC pour compter les adresses par commune (utilisée dans le polling statut)
CREATE OR REPLACE FUNCTION count_adresses_commune(p_code_insee TEXT)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::INTEGER FROM adresses WHERE code_insee = p_code_insee;
$$;

-- Mise à jour du type_bien d'une adresse avec journalisation automatique
CREATE OR REPLACE FUNCTION update_type_bien(
  p_adresse_id TEXT,
  p_type_bien  TEXT,
  p_user_id    UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ancien TEXT;
BEGIN
  -- Récupérer la valeur actuelle
  SELECT type_bien INTO v_ancien FROM adresses WHERE id = p_adresse_id;

  -- Mettre à jour
  UPDATE adresses SET type_bien = p_type_bien WHERE id = p_adresse_id;

  -- Journaliser si changement
  IF v_ancien IS DISTINCT FROM p_type_bien THEN
    INSERT INTO adresses_historique(adresse_id, champ, ancienne_valeur, nouvelle_valeur, modifie_par)
    VALUES (p_adresse_id, 'type_bien', v_ancien, p_type_bien, p_user_id);
  END IF;
END;
$$;

-- Grant sur les fonctions RPC
GRANT EXECUTE ON FUNCTION get_adresses_secteur TO authenticated;
GRANT EXECUTE ON FUNCTION count_adresses_commune TO authenticated;
GRANT EXECUTE ON FUNCTION update_type_bien TO authenticated;
