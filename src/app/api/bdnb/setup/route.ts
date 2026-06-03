import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// POST /api/bdnb/setup
// Applies DDL for BDNB tables, trigger and matching functions.
// Must be called with x-internal-key = SUPABASE_SERVICE_ROLE_KEY
// (or from an authenticated admin session – not yet implemented).

const MATCH_BAN_SQL = `
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
      OR b.cle_interop_adr_principale_ban LIKE (a.id || '%')
      OR b.l_cle_interop_adr @> to_jsonb(a.id)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(b.l_cle_interop_adr) k
        WHERE k LIKE (a.id || '%') OR a.id LIKE (k || '%')
      )
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`

const MATCH_PROXIMITY_SQL = `
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
      AND (b.geom_centre IS NOT NULL OR (b.lon_centre IS NOT NULL AND b.lat_centre IS NOT NULL))
      AND ST_DWithin(
        a2.geom::geography,
        COALESCE(b.geom_centre, ST_SetSRID(ST_MakePoint(b.lon_centre, b.lat_centre), 4326))::geography,
        30
      )
    ORDER BY a2.id, ST_Distance(
      a2.geom::geography,
      COALESCE(b.geom_centre, ST_SetSRID(ST_MakePoint(b.lon_centre, b.lat_centre), 4326))::geography
    )
  ) sub
  WHERE a.id = sub.adresse_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`

const DIAGNOSTIC_SQL = `
CREATE OR REPLACE FUNCTION bdnb_diagnostic(p_code_insee TEXT)
RETURNS JSONB AS $$
DECLARE
  v_adresses INTEGER;
  v_bdnb INTEGER;
  v_with_geom INTEGER;
  v_matched INTEGER;
  v_sample_adresse TEXT;
  v_sample_cle TEXT;
BEGIN
  SELECT COUNT(*) INTO v_adresses FROM adresses WHERE code_insee = p_code_insee;
  SELECT COUNT(*) INTO v_bdnb FROM bdnb_batiment_groupe WHERE code_commune_insee = p_code_insee;
  SELECT COUNT(*) INTO v_with_geom FROM bdnb_batiment_groupe WHERE code_commune_insee = p_code_insee AND geom_centre IS NOT NULL;
  SELECT COUNT(*) INTO v_matched FROM adresses WHERE code_insee = p_code_insee AND batiment_groupe_id IS NOT NULL;
  SELECT id INTO v_sample_adresse FROM adresses WHERE code_insee = p_code_insee LIMIT 1;
  SELECT cle_interop_adr_principale_ban INTO v_sample_cle FROM bdnb_batiment_groupe WHERE code_commune_insee = p_code_insee LIMIT 1;
  RETURN jsonb_build_object(
    'adresses_total', v_adresses,
    'bdnb_total', v_bdnb,
    'bdnb_with_geom', v_with_geom,
    'already_matched', v_matched,
    'sample_adresse_id', v_sample_adresse,
    'sample_cle_ban', v_sample_cle
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`

const TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION bdnb_compute_geom_centre()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lon_centre IS NOT NULL AND NEW.lat_centre IS NOT NULL THEN
    NEW.geom_centre := ST_SetSRID(ST_MakePoint(NEW.lon_centre, NEW.lat_centre), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bdnb_compute_geom ON bdnb_batiment_groupe;
CREATE TRIGGER trg_bdnb_compute_geom
  BEFORE INSERT OR UPDATE ON bdnb_batiment_groupe
  FOR EACH ROW EXECUTE FUNCTION bdnb_compute_geom_centre();
`

const FIX_GEOM_SQL = `
UPDATE bdnb_batiment_groupe
SET geom_centre = ST_SetSRID(ST_MakePoint(lon_centre, lat_centre), 4326)
WHERE lon_centre IS NOT NULL AND lat_centre IS NOT NULL AND geom_centre IS NULL;
`

const COL_SQL = `
ALTER TABLE adresses ADD COLUMN IF NOT EXISTS batiment_groupe_id TEXT;
CREATE INDEX IF NOT EXISTS adresses_bdnb_id_idx ON adresses(batiment_groupe_id);
CREATE INDEX IF NOT EXISTS bdnb_bg_commune_idx ON bdnb_batiment_groupe(code_commune_insee);
CREATE INDEX IF NOT EXISTS bdnb_bg_cle_ban_idx ON bdnb_batiment_groupe(cle_interop_adr_principale_ban);
CREATE INDEX IF NOT EXISTS bdnb_bg_geom_idx    ON bdnb_batiment_groupe USING GIST(geom_centre);
CREATE INDEX IF NOT EXISTS bdnb_bg_l_cle_idx   ON bdnb_batiment_groupe USING GIN(l_cle_interop_adr);
`

export async function POST(request: Request) {
  const key = request.headers.get('x-internal-key')
  if (key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Extract project ref from URL (e.g. https://wqejnbpnucfbjblyvdca.supabase.co → wqejnbpnucfbjblyvdca)
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0]

  const steps = [
    { name: 'add_columns_indexes', sql: COL_SQL },
    { name: 'trigger_function', sql: TRIGGER_SQL },
    { name: 'fix_existing_geom', sql: FIX_GEOM_SQL },
    { name: 'match_ban_key_fn', sql: MATCH_BAN_SQL },
    { name: 'match_proximity_fn', sql: MATCH_PROXIMITY_SQL },
    { name: 'diagnostic_fn', sql: DIAGNOSTIC_SQL },
  ]

  const results: any[] = []
  const managementApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

  for (const step of steps) {
    try {
      const resp = await fetch(managementApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: step.sql }),
      })
      const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
      if (!resp.ok) {
        results.push({ step: step.name, ok: false, error: body?.message ?? body?.error ?? `HTTP ${resp.status}` })
      } else {
        results.push({ step: step.name, ok: true })
      }
    } catch (err: any) {
      results.push({ step: step.name, ok: false, error: err.message })
    }
  }

  const allOk = results.every(r => r.ok)

  // If management API failed (needs OAuth token, not service role key),
  // return the full SQL for manual execution in Supabase SQL Editor.
  const anyFailed = results.some(r => !r.ok)
  const fullSql = anyFailed
    ? steps.map(s => `-- ${s.name}\n${s.sql}`).join('\n\n')
    : null

  return NextResponse.json({
    ok: allOk,
    results,
    ...(anyFailed && {
      manual_sql_required: true,
      instructions: 'La Management API Supabase nécessite un token OAuth, pas la clé service. Exécutez le SQL ci-dessous dans Supabase Dashboard > SQL Editor.',
      sql: fullSql,
    }),
  })
}
