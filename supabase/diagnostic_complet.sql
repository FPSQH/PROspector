-- ============================================================
-- PROspector – DIAGNOSTIC COMPLET
-- Coller dans Supabase SQL Editor > Run
-- Donne une radiographie complète de la base pour audit.
-- ============================================================

-- ── 1. TABLES PRÉSENTES ───────────────────────────────────────
SELECT '=== 1. TABLES PRÉSENTES ===' AS section;

SELECT
  t.table_name,
  pg_stat_user_tables.n_live_tup AS nb_lignes_approx
FROM information_schema.tables t
LEFT JOIN pg_stat_user_tables
  ON pg_stat_user_tables.relname = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;


-- ── 2. COLONNES PAR TABLE ────────────────────────────────────
SELECT '=== 2. COLONNES PAR TABLE ===' AS section;

SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;


-- ── 3. TABLES ATTENDUES PAR LE CODE — PRÉSENCE OUI/NON ───────
SELECT '=== 3. TABLES ATTENDUES — PRÉSENCE ===' AS section;

SELECT
  expected.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN '✅ présente' ELSE '❌ MANQUANTE' END AS statut
FROM (VALUES
  ('commerciaux'),
  ('communes'),
  ('adresses'),
  ('adresses_historique'),
  ('zones_prospection'),
  ('sessions_prospection'),
  ('contacts'),
  ('interactions'),
  ('rendez_vous'),
  ('dpe_logement'),
  ('zones_snapshots'),
  ('projets_immobiliers'),
  ('planning_sessions'),
  ('planning_config'),
  ('itineraires_zone')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_name = expected.table_name
  AND t.table_schema = 'public'
ORDER BY expected.table_name;


-- ── 4. COLONNES CRITIQUES ATTENDUES — PRÉSENCE OUI/NON ───────
SELECT '=== 4. COLONNES CRITIQUES — PRÉSENCE ===' AS section;

SELECT
  expected.table_name,
  expected.column_name,
  CASE WHEN c.column_name IS NOT NULL THEN '✅ présente' ELSE '❌ MANQUANTE' END AS statut
FROM (VALUES
  -- commerciaux
  ('commerciaux',         'must_change_password'),
  ('commerciaux',         'manager_id'),
  -- communes
  ('communes',            'derniere_verif_dpe'),
  ('communes',            'nb_dpe'),
  -- adresses
  ('adresses',            'zone_id'),
  ('adresses',            'latest_dpe_date'),
  ('adresses',            'geom'),
  -- zones_prospection
  ('zones_prospection',   'polygone'),
  ('zones_prospection',   'polygone_geojson'),
  ('zones_prospection',   'nb_dpe_chauds'),
  ('zones_prospection',   'nb_dpe_tiedes'),
  ('zones_prospection',   'dpe_prioritaire'),
  -- sessions_prospection
  ('sessions_prospection','type_session'),
  ('sessions_prospection','hors_zone'),
  ('sessions_prospection','commune_code_insee'),
  ('sessions_prospection','commune_nom'),
  ('sessions_prospection','rapport_json'),
  ('sessions_prospection','nb_portes'),
  ('sessions_prospection','nb_boites'),
  -- contacts
  ('contacts',            'nom'),
  ('contacts',            'tel1'),
  ('contacts',            'tel2'),
  ('contacts',            'email1'),
  ('contacts',            'email2'),
  ('contacts',            'interaction_id'),
  ('contacts',            'date_relance'),
  ('contacts',            'statut_pipeline'),
  -- dpe_logement (si table présente)
  ('dpe_logement',        'numero_dpe'),
  ('dpe_logement',        'code_insee'),
  ('dpe_logement',        'adresse_id'),
  ('dpe_logement',        'etiquette_dpe'),
  ('dpe_logement',        'etiquette_ges'),
  ('dpe_logement',        'date_etablissement'),
  ('dpe_logement',        'date_modification'),
  ('dpe_logement',        'date_fin_validite'),
  ('dpe_logement',        'lat'),
  ('dpe_logement',        'lon'),
  ('dpe_logement',        'geom'),
  ('dpe_logement',        'match_confiance'),
  ('dpe_logement',        'has_audit'),
  ('dpe_logement',        'audit_n'),
  ('dpe_logement',        'audit_date'),
  ('dpe_logement',        'audit_scenarios'),
  ('dpe_logement',        'surface_habitable'),
  ('dpe_logement',        'type_batiment'),
  ('dpe_logement',        'conso_ep_m2'),
  ('dpe_logement',        'cout_annuel'),
  -- zones_snapshots
  ('zones_snapshots',     'commercial_id'),
  ('zones_snapshots',     'nom'),
  ('zones_snapshots',     'nb_zones'),
  ('zones_snapshots',     'zones_data'),
  -- projets_immobiliers
  ('projets_immobiliers', 'commercial_id'),
  ('projets_immobiliers', 'contact_id'),
  ('projets_immobiliers', 'type_projet'),
  ('projets_immobiliers', 'horizon_projet'),
  ('projets_immobiliers', 'motif_projet'),
  ('projets_immobiliers', 'statut'),
  -- planning_sessions
  ('planning_sessions',   'commercial_id'),
  ('planning_sessions',   'zone_id'),
  ('planning_sessions',   'session_id'),
  ('planning_sessions',   'date_prevue'),
  ('planning_sessions',   'mois'),
  ('planning_sessions',   'annee'),
  ('planning_sessions',   'heure_debut'),
  ('planning_sessions',   'heure_fin'),
  ('planning_sessions',   'statut'),
  ('planning_sessions',   'nb_adresses_total'),
  ('planning_sessions',   'nb_adresses_visitees'),
  ('planning_sessions',   'nb_contacts'),
  -- planning_config
  ('planning_config',     'commercial_id'),
  ('planning_config',     'jours_semaine'),
  ('planning_config',     'heure_debut'),
  ('planning_config',     'duree_minutes'),
  ('planning_config',     'date_debut'),
  ('planning_config',     'heure_debut_2'),
  ('planning_config',     'jours_semaine_2')
) AS expected(table_name, column_name)
LEFT JOIN information_schema.columns c
  ON c.table_name   = expected.table_name
  AND c.column_name = expected.column_name
  AND c.table_schema = 'public'
ORDER BY expected.table_name, expected.column_name;


-- ── 5. INDEX ─────────────────────────────────────────────────
SELECT '=== 5. INDEX ===' AS section;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;


-- ── 6. POLITIQUES RLS ────────────────────────────────────────
SELECT '=== 6. POLITIQUES RLS ===' AS section;

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ── 7. RLS ACTIVÉ PAR TABLE ───────────────────────────────────
SELECT '=== 7. RLS ACTIVÉ PAR TABLE ===' AS section;

SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
ORDER BY relname;


-- ── 8. TRIGGERS ──────────────────────────────────────────────
SELECT '=== 8. TRIGGERS ===' AS section;

SELECT
  trigger_name,
  event_object_table AS table_name,
  event_manipulation AS event,
  action_timing AS timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;


-- ── 9. FONCTIONS / RPC ───────────────────────────────────────
SELECT '=== 9. FONCTIONS RPC ===' AS section;

SELECT
  routine_name,
  routine_type,
  data_type AS return_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;


-- ── 10. VUES (normales + matérialisées) ──────────────────────
SELECT '=== 10. VUES ===' AS section;

SELECT table_name AS view_name, 'vue normale' AS type
FROM information_schema.views
WHERE table_schema = 'public'

UNION ALL

SELECT matviewname AS view_name, 'vue matérialisée' AS type
FROM pg_matviews
WHERE schemaname = 'public'

ORDER BY type, view_name;


-- ── 11. EXTENSIONS INSTALLÉES ────────────────────────────────
SELECT '=== 11. EXTENSIONS ===' AS section;

SELECT name, default_version, installed_version, comment
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;


-- ── 12. CONTRAINTES CHECK ────────────────────────────────────
SELECT '=== 12. CONTRAINTES CHECK ===' AS section;

SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON cc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;


-- ── 13. CLÉS ÉTRANGÈRES ──────────────────────────────────────
SELECT '=== 13. CLÉS ÉTRANGÈRES ===' AS section;

SELECT
  tc.table_name AS table_source,
  kcu.column_name AS colonne_source,
  ccu.table_name AS table_cible,
  ccu.column_name AS colonne_cible,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;


-- ── 14. TAILLE DES TABLES ────────────────────────────────────
SELECT '=== 14. TAILLE DES TABLES ===' AS section;

SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS taille_totale,
  pg_size_pretty(pg_relation_size(relid)) AS taille_donnees,
  pg_stat_user_tables.n_live_tup AS nb_lignes_approx
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
