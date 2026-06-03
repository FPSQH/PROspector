import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/bdnb/diagnostic?code_insee=22042
// Returns diagnostic info about BDNB data for a commune.

export async function GET(request: Request) {
  const key = request.headers.get('x-internal-key')
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user && key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const code_insee = searchParams.get('code_insee')
  if (!code_insee) {
    return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })
  }

  const supabase = createAdminClientDirect(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Check if functions exist via pg_proc (works with service role)
  const { data: functions } = await supabase
    .from('pg_proc' as any)
    .select('proname')
    .in('proname', ['match_bdnb_by_ban_key', 'match_bdnb_by_proximity', 'bdnb_diagnostic', 'bdnb_compute_geom_centre'])

  // Sample adresses for this commune
  const { data: adressesSample } = await supabase
    .from('adresses')
    .select('id, batiment_groupe_id')
    .eq('code_insee', code_insee)
    .limit(3)

  // Count adresses
  const { count: adressesCount } = await supabase
    .from('adresses')
    .select('*', { count: 'exact', head: true })
    .eq('code_insee', code_insee)

  // Sample BDNB rows
  const { data: bdnbSample, error: bdnbErr } = await supabase
    .from('bdnb_batiment_groupe')
    .select('batiment_groupe_id, cle_interop_adr_principale_ban, l_cle_interop_adr, lat_centre, lon_centre, geom_centre')
    .eq('code_commune_insee', code_insee)
    .limit(3)

  // Count BDNB rows
  const { count: bdnbCount } = await supabase
    .from('bdnb_batiment_groupe')
    .select('*', { count: 'exact', head: true })
    .eq('code_commune_insee', code_insee)

  // Count rows without geom_centre
  const { count: noGeomCount } = await supabase
    .from('bdnb_batiment_groupe')
    .select('*', { count: 'exact', head: true })
    .eq('code_commune_insee', code_insee)
    .is('geom_centre', null)

  // Count matched adresses
  const { count: matchedCount } = await supabase
    .from('adresses')
    .select('*', { count: 'exact', head: true })
    .eq('code_insee', code_insee)
    .not('batiment_groupe_id', 'is', null)

  // Try calling bdnb_diagnostic if it exists
  const { data: diagData, error: diagErr } = await supabase
    .rpc('bdnb_diagnostic', { p_code_insee: code_insee })

  return NextResponse.json({
    code_insee,
    functions_exist: functions?.map((f: any) => f.proname) ?? [],
    adresses: {
      total: adressesCount,
      matched: matchedCount,
      sample: adressesSample,
    },
    bdnb: {
      total: bdnbCount,
      no_geom_centre: noGeomCount,
      sample: bdnbSample,
      error: bdnbErr?.message ?? null,
    },
    rpc_diagnostic: diagData ?? null,
    rpc_diagnostic_error: diagErr ? { code: diagErr.code, message: diagErr.message } : null,
  })
}
