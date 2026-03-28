import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// POST /api/zones/[id]/recalc
// Body : { polygone_geojson: object } — nouveau polygone GeoJSON
// Retourne : { nb_incluses, nb_transferees, confirmer_transfert }
export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { polygone_geojson, confirme = false } = body

  if (!polygone_geojson) {
    return NextResponse.json({ error: 'polygone_geojson requis' }, { status: 400 })
  }

  // Vérifier que la zone appartient au commercial
  const { data: zone } = await supabase
    .from('zones_prospection')
    .select('id, commercial_id')
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!zone) return NextResponse.json({ error: 'Zone non trouvée' }, { status: 404 })

  // Convertir GeoJSON → WKT et mettre à jour le polygone
  const wkt = geojsonToWKT(polygone_geojson)
  if (!wkt) return NextResponse.json({ error: 'Polygone invalide' }, { status: 400 })

  // Sauvegarder l'historique avant modification
  await supabase.rpc('save_zone_version', {
    p_zone_id:     params.id,
    p_type_modif:  'correction',
    p_modifie_par: user.id,
  })

  // Mettre à jour le polygone
  await supabase
    .from('zones_prospection')
    .update({ polygone: wkt })
    .eq('id', params.id)

  // Recalculer les adresses via PostGIS
  const { data: result } = await supabase.rpc('recalc_zone_adresses', {
    p_zone_id:       params.id,
    p_commercial_id: user.id,
  })

  const nb_incluses   = result?.[0]?.nb_incluses   ?? 0
  const nb_transferees = result?.[0]?.nb_transferees ?? 0

  // Si des adresses seraient transférées et pas encore confirmé → demander confirmation
  if (nb_transferees > 0 && !confirme) {
    return NextResponse.json({
      confirmer_transfert: true,
      nb_incluses,
      nb_transferees,
      message: `${nb_transferees} adresse${nb_transferees > 1 ? 's' : ''} appartenant à d'autres zones seront transférées dans cette zone. Confirmer ?`,
    })
  }

  // Recalculer l'itinéraire TSP via SQL (ordre de visite)
  await supabase.rpc('recalc_itineraire_zone', { p_zone_id: params.id })

  return NextResponse.json({ ok: true, nb_incluses, nb_transferees })
}

// Conversion GeoJSON Polygon → WKT simple
function geojsonToWKT(geojson: any): string | null {
  try {
    if (geojson.type === 'Feature') return geojsonToWKT(geojson.geometry)
    if (geojson.type !== 'Polygon') return null
    const ring = geojson.coordinates[0]
    if (!ring || ring.length < 3) return null
    const coords = ring.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ')
    return `SRID=4326;POLYGON((${coords}))`
  } catch {
    return null
  }
}
