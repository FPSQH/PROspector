import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // commerciaux.id = auth.uid()
  const { data: commercial } = await supabase
    .from('commerciaux').select('id').eq('id', user.id).single()

  if (!commercial) return NextResponse.json({ zones: [], nb_adresses_total: 0 })

  // Zones via la vue GeoJSON
  const { data: zones, error } = await supabase
    .from('vue_zones_geojson')
    .select('*')
    .eq('commercial_id', commercial.id)
    .order('numero')

  const zonesData = error
    ? ((await supabase.from('zones_prospection')
        .select('id, nom, numero, couleur, statut, capacite_theorique, nb_adresses, nb_prospectables, nb_logements_sociaux')
        .eq('commercial_id', commercial.id)
        .order('numero')).data ?? [])
    : (zones ?? [])

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
