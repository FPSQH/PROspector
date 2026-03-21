-- ============================================================
-- DIAGNOSTIC – Coller dans SQL Editor et cliquer Run
-- Montre ce qui est installé et ce qui manque
-- ============================================================

-- 1. PostGIS installé ?
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name = 'postgis';

-- 2. Tables existantes dans le schéma public
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 3. Trigger on_auth_user_created présent ?
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
