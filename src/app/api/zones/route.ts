import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // commerciaux.id = auth.uid()
  const { data: commercial } = await supabase
    .from('commerciaux').select('id').eq('id', user.id).single()

  if (!commercial) return NextResponse.json({ zones: [], nb_adresses_total: 0 })

  // Zones via admin client (service role) — contourne le cache PostgREST
  const adminSupabase = createAdminClient()
  const { data: zonesRaw } = await adminSupabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, statut, capacite_theorique, nb_adresses, nb_prospectables, nb_logements_sociaux, polygone_geojson, centroide_geojson')
    .eq('commercial_id', commercial.id)
    .eq('statut', 'active')
    .order('numero')

  const zonesData = zonesRaw ?? []

  // Nombre total d'adresses du secteur (toutes communes)
  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', commercial.id)

  let nbAdressesTotal = 0
  if (communes && communes.length > 0) {
    const codesInsee = communes.map((c: any) => c.code_insee)
    // Batch de 5 pour éviter les URLs trop longues
    for (let i = 0; i < codesInsee.length; i += 5) {
      const batch = codesInsee.slice(i, i + 5)
      const { count } = await supabase
        .from('adresses')
        .select('id', { count: 'exact', head: true })
        .in('code_insee', batch)
      nbAdressesTotal += count ?? 0
    }
  }

  return NextResponse.json({ zones: zonesData, nb_adresses_total: nbAdressesTotal })
}

// POST /api/zones — créer une zone manuellement depuis l'éditeur
// Body : { nom, polygone_geojson }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { nom, polygone_geojson } = body
  if (!polygone_geojson) return NextResponse.json({ error: 'polygone_geojson requis' }, { status: 400 })

  const { data: commercial } = await supabase
    .from('commerciaux').select('id').eq('id', user.id).single()
  if (!commercial) return NextResponse.json({ error: 'Commercial non trouvé' }, { status: 404 })

  const COLORS = ['#E63946','#2196F3','#FF9800','#4CAF50','#9C27B0','#00BCD4','#FF5722','#607D8B','#795548','#E91E63','#00897B','#F57F17']

  // Numérotation intelligente : trouver le premier numéro manquant dans la séquence
  const { data: existingZones } = await supabase
    .from('zones_prospection')
    .select('numero')
    .eq('commercial_id', commercial.id)
    .order('numero')

  const numerosExistants = new Set((existingZones ?? []).map((z: any) => z.numero))
  let numero = 1
  while (numerosExistants.has(numero)) numero++

  // Convertir GeoJSON → WKT
  const ring = polygone_geojson?.coordinates?.[0] ?? polygone_geojson?.geometry?.coordinates?.[0]
  if (!ring) return NextResponse.json({ error: 'Polygone invalide' }, { status: 400 })
  const coords = ring.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ')
  const wkt = `SRID=4326;POLYGON((${coords}))`

  const { data: zone, error } = await supabase
    .from('zones_prospection')
    .insert({
      commercial_id: commercial.id,
      nom:           nom ?? `Zone ${numero}`,
      numero,
      couleur:       COLORS[(numero - 1) % COLORS.length],
      statut:        'active',
      capacite_theorique: 150,
      nb_adresses:        0,
      nb_prospectables:   0,
      nb_logements_sociaux: 0,
      polygone:      wkt,
    })
    .select().single()

  if (error || !zone) return NextResponse.json({ error: error?.message ?? 'Erreur création' }, { status: 500 })

  // Assigner les adresses incluses dans le polygone
  const { data: result } = await supabase.rpc('recalc_zone_adresses', {
    p_zone_id:       zone.id,
    p_commercial_id: commercial.id,
  })

  const nb_adresses = result?.[0]?.nb_incluses ?? 0
  return NextResponse.json({ ok: true, id: zone.id, nom: zone.nom, nb_adresses })
}
