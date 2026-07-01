import { createClient } from '@/lib/supabase/server'
import { getEffectiveCommercialId } from '@/lib/delegation'
import { NextResponse } from 'next/server'

// Retourne les points DVF (10 ans) avec id_parcelle pour filtrage/agrégation client-side
export async function GET(_req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', effectiveId)

  if (!communes?.length) return NextResponse.json({ points: [] })

  const codesInsee = communes.map((c: any) => c.code_insee)
  const since = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: points } = await supabase
    .from('dvf_mutations')
    .select('id, latitude, longitude, valeur_fonciere, type_local, date_mutation, id_parcelle')
    .in('code_commune', codesInsee)
    .eq('nature_mutation', 'Vente')
    .in('type_local', ['Maison', 'Appartement'])
    .gte('date_mutation', since)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('date_mutation', { ascending: false })
    .limit(10000)

  const result = (points ?? []).map((p: any) => ({
    id:              p.id,
    lat:             p.latitude,
    lon:             p.longitude,
    valeur_fonciere: p.valeur_fonciere,
    type_local:      p.type_local,
    date_mutation:   p.date_mutation,
    id_parcelle:     p.id_parcelle ?? null,
  }))

  return NextResponse.json({ points: result })
}
