-- ══════════════════════════════════════════════════════════════════
-- Migration BDNB – Base de Données Nationale des Bâtiments
-- ══════════════════════════════════════════════════════════════════

-- 1. Add batiment_groupe_id FK on adresses
ALTER TABLE adresses ADD COLUMN IF NOT EXISTS batiment_groupe_id TEXT;
CREATE INDEX IF NOT EXISTS adresses_bdnb_id_idx ON adresses(batiment_groupe_id);

-- 2. Main BDNB table with ALL fields from the API (134 columns observed)
CREATE TABLE IF NOT EXISTS bdnb_batiment_groupe (
  -- Identité
  batiment_groupe_id TEXT PRIMARY KEY,
  code_commune_insee TEXT,
  code_departement_insee TEXT,
  code_epci_insee TEXT,
  code_iris TEXT,
  code_region_insee TEXT,
  libelle_commune_insee TEXT,
  commune_parente TEXT,
  libelle_adr_principale_ban TEXT,
  cle_interop_adr_principale_ban TEXT,
  l_cle_interop_adr JSONB,
  l_libelle_adr JSONB,
  l_parcelle_id JSONB,
  l_denomination_proprietaire JSONB,
  l_siren JSONB,
  nb_adresse_valid_ban INTEGER,
  numero_immat_principal TEXT,
  -- Géométrie (GeoJSON brut Lambert-93 + centroïde WGS84 calculé)
  geom_groupe JSONB,
  s_geom_groupe FLOAT,
  lat_centre DOUBLE PRECISION,
  lon_centre DOUBLE PRECISION,
  geom_centre GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lon_centre, lat_centre), 4326)
  ) STORED,
  -- Physique
  usage_principal_bdnb_open TEXT,
  usage_niveau_1_txt TEXT,
  type_batiment_dpe TEXT,
  annee_construction INTEGER,
  annee_construction_dpe INTEGER,
  nb_log INTEGER,
  nb_log_rnc INTEGER,
  nb_lot_garpark_rnc INTEGER,
  nb_lot_tertiaire_rnc INTEGER,
  surface_emprise_sol FLOAT,
  hauteur_mean FLOAT,
  nb_niveau INTEGER,
  altitude_sol_mean FLOAT,
  traversant BOOLEAN,
  presence_balcon BOOLEAN,
  contient_fictive_geom_groupe BOOLEAN,
  croisement_geospx_reussi BOOLEAN,
  -- DPE / Énergie
  classe_bilan_dpe TEXT,
  classe_conso_energie_arrete_2012 TEXT,
  classe_conso_energie_dpe_tertiaire TEXT,
  classe_inertie TEXT,
  arrete_2021 TEXT,
  identifiant_dpe TEXT,
  date_reception_dpe TEXT,
  type_dpe TEXT,
  conso_5_usages_ep_m2 FLOAT,
  conso_3_usages_ep_m2_arrete_2012 FLOAT,
  emission_ges_5_usages_m2 FLOAT,
  emission_ges_3_usages_ep_m2_arrete_2012 FLOAT,
  nb_classe_bilan_dpe_a INTEGER,
  nb_classe_bilan_dpe_b INTEGER,
  nb_classe_bilan_dpe_c INTEGER,
  nb_classe_bilan_dpe_d INTEGER,
  nb_classe_bilan_dpe_e INTEGER,
  nb_classe_bilan_dpe_f INTEGER,
  nb_classe_bilan_dpe_g INTEGER,
  nb_classe_conso_energie_arrete_2012_a INTEGER,
  nb_classe_conso_energie_arrete_2012_b INTEGER,
  nb_classe_conso_energie_arrete_2012_c INTEGER,
  nb_classe_conso_energie_arrete_2012_d INTEGER,
  nb_classe_conso_energie_arrete_2012_e INTEGER,
  nb_classe_conso_energie_arrete_2012_f INTEGER,
  nb_classe_conso_energie_arrete_2012_g INTEGER,
  nb_classe_conso_energie_arrete_2012_nc INTEGER,
  -- Consommation réelle (DLE 2020)
  conso_res_dle_elec_2020 FLOAT,
  conso_res_dle_gaz_2020 FLOAT,
  conso_pro_dle_elec_2020 FLOAT,
  conso_pro_dle_gaz_2020 FLOAT,
  nb_pdl_res_dle_elec_2020 INTEGER,
  nb_pdl_res_dle_gaz_2020 INTEGER,
  nb_pdl_pro_dle_elec_2020 INTEGER,
  nb_pdl_pro_dle_gaz_2020 INTEGER,
  -- Matériaux
  mat_mur_txt TEXT,
  mat_toit_txt TEXT,
  materiaux_structure_mur_exterieur TEXT,
  type_isolation_mur_exterieur TEXT,
  type_isolation_plancher_bas TEXT,
  type_isolation_plancher_haut TEXT,
  type_plancher_bas_deperditif TEXT,
  type_plancher_haut_deperditif TEXT,
  type_materiaux_menuiserie TEXT,
  type_fermeture TEXT,
  type_vitrage TEXT,
  type_gaz_lame TEXT,
  vitrage_vir TEXT,
  epaisseur_lame FLOAT,
  facteur_solaire_baie_vitree FLOAT,
  pourcentage_surface_baie_vitree_exterieur FLOAT,
  l_orientation_baie_vitree JSONB,
  u_baie_vitree FLOAT,
  u_mur_exterieur FLOAT,
  u_plancher_bas_final_deperditif FLOAT,
  u_plancher_haut_deperditif FLOAT,
  uw FLOAT,
  -- Chauffage / ECS
  type_installation_chauffage TEXT,
  nb_installation_chauffage INTEGER,
  type_installation_ecs TEXT,
  nb_installation_ecs INTEGER,
  type_energie_chauffage TEXT,
  type_energie_chauffage_appoint TEXT,
  type_energie_chauffage_tertiaire TEXT,
  type_generateur_chauffage TEXT,
  type_generateur_chauffage_anciennete TEXT,
  type_generateur_chauffage_appoint TEXT,
  type_generateur_chauffage_anciennete_appoint TEXT,
  type_generateur_ecs TEXT,
  type_generateur_ecs_anciennete TEXT,
  type_generateur_ecs_appoint TEXT,
  type_generateur_ecs_anciennete_appoint TEXT,
  type_generateur_climatisation TEXT,
  type_generateur_climatisation_anciennete TEXT,
  type_ventilation TEXT,
  chauffage_solaire BOOLEAN,
  ecs_solaire BOOLEAN,
  type_production_energie_renouvelable TEXT,
  methode_application_dpe_tertiaire TEXT,
  -- Patrimoine / risques
  denomination_monument_historique TEXT,
  nom_batiment_historique_plus_proche TEXT,
  distance_monument_historique FLOAT,
  distance_batiment_historique_plus_proche FLOAT,
  perimetre_bat_historique TEXT,
  zone_plu_bati_patrimonial TEXT,
  contrainte_urbanisme_ac1 TEXT,
  alea_argile TEXT,
  alea_argiles TEXT,
  -- Quartiers prioritaires
  quartier_prioritaire BOOLEAN,
  nom_qp TEXT,
  nom_quartier_qpv TEXT,
  code_qp TEXT,
  -- Réseau chaleur / foncier
  id_reseau TEXT,
  indicateur_distance_au_reseau TEXT,
  valeur_fonciere_m2_residentiel_rel_commune FLOAT,
  -- Fiabilité
  fiabilite_cr_adr_niv_1 TEXT,
  fiabilite_cr_adr_niv_2 TEXT,
  fiabilite_emprise_sol TEXT,
  fiabilite_hauteur TEXT,
  -- Metadata
  source TEXT DEFAULT 'BDNB',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bdnb_bg_commune_idx ON bdnb_batiment_groupe(code_commune_insee);
CREATE INDEX IF NOT EXISTS bdnb_bg_cle_ban_idx ON bdnb_batiment_groupe(cle_interop_adr_principale_ban);
CREATE INDEX IF NOT EXISTS bdnb_bg_dpe_idx     ON bdnb_batiment_groupe(classe_bilan_dpe);
CREATE INDEX IF NOT EXISTS bdnb_bg_usage_idx   ON bdnb_batiment_groupe(usage_principal_bdnb_open);
CREATE INDEX IF NOT EXISTS bdnb_bg_geom_idx    ON bdnb_batiment_groupe USING GIST(geom_centre);
CREATE INDEX IF NOT EXISTS bdnb_bg_l_cle_idx   ON bdnb_batiment_groupe USING GIN(l_cle_interop_adr);

-- ══════════════════════════════════════════════════════════════════
-- Fonctions de matching (appelées depuis l'API match)
-- ══════════════════════════════════════════════════════════════════

-- Passe 1 : matching par clé BAN (principal et liste l_cle_interop_adr)
CREATE OR REPLACE FUNCTION match_bdnb_by_ban_key(p_code_insee TEXT)
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE adresses a
  SET batiment_groupe_id = b.batiment_groupe_id
  FROM bdnb_batiment_groupe b
  WHERE a.code_insee = p_code_insee
    AND b.code_commune_insee = p_code_insee
    AND a.batiment_groupe_id IS NULL
    AND (
      a.id = b.cle_interop_adr_principale_ban
      OR b.l_cle_interop_adr @> to_jsonb(a.id)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Passe 2 : fallback spatial (30 m – bâtiment le plus proche)
CREATE OR REPLACE FUNCTION match_bdnb_by_proximity(p_code_insee TEXT)
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE adresses a
  SET batiment_groupe_id = sub.batiment_groupe_id
  FROM (
    SELECT DISTINCT ON (a2.id) a2.id AS adresse_id, b.batiment_groupe_id
    FROM adresses a2
    JOIN bdnb_batiment_groupe b ON b.code_commune_insee = p_code_insee
    WHERE a2.code_insee = p_code_insee
      AND a2.batiment_groupe_id IS NULL
      AND b.geom_centre IS NOT NULL
      AND ST_DWithin(a2.geom::geography, b.geom_centre::geography, 30)
    ORDER BY a2.id, ST_Distance(a2.geom::geography, b.geom_centre::geography)
  ) sub
  WHERE a.id = sub.adresse_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
