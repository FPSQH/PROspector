import { createClient } from '@/lib/supabase/server'
import { getEffectiveCommercialId } from '@/lib/delegation'
import { NextResponse } from 'next/server'

// Retourne les points DVF (mutations) pour la heatmap et les parcelles colorées
export async function GET(_req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', effectiveId)

  if (!communes?.length) return NextResponse.json({ points: [], parcelles: [] })

  const codesInsee = communes.map((c: any) => c.code_insee)

  // Points DVF pour heatmap (lat/lon + valeur)
  const { data: points } = await supabase
    .from('dvf_mutations')
    .select('id, lat, lon, valeur_fonciere, type_local, date_mutation')
    .in('code_commune', codesInsee)
    .eq('nature_mutation', 'Vente')
    .in('type_local', ['Maison', 'Appartement'])
    .gte('date_mutation', new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .limit(20000)

  // Agrégation par parcelle pour colorisation cadastrale
  const { data: parcelles } = await (supabase as any)
    .rpc('dvf_density_per_parcel', { p_codes_insee: codesInsee, p_annees: 5 })

  return NextResponse.json({
    points: points ?? [],
    parcelles: parcelles ?? [],
  })
}
