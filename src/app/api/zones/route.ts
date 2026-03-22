import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // commerciaux.id = auth.uid() directement
  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!commercial) return NextResponse.json({ zones: [] })

  // Essayer la vue GeoJSON d'abord
  const { data: zones, error } = await supabase
    .from('vue_zones_geojson')
    .select('*')
    .eq('commercial_id', commercial.id)
    .order('numero')

  if (error) {
    // Fallback sur la table directe
    const { data: fallback } = await supabase
      .from('zones_prospection')
      .select('id, nom, numero, couleur, statut, capacite_theorique, nb_adresses, nb_prospectables, nb_logements_sociaux')
      .eq('commercial_id', commercial.id)
      .order('numero')
    return NextResponse.json({ zones: fallback ?? [] })
  }

  return NextResponse.json({ zones: zones ?? [] })
}
