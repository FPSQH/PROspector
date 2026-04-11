import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean)
  if (!ids.length) return NextResponse.json({ zones: [] })

  // Charger les zones
  const { data: zonesRaw } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_adresses, nb_prospectables, nb_dpe_chauds')
    .in('id', ids)
    .eq('commercial_id', user.id)
    .order('numero')

  if (!zonesRaw?.length) return NextResponse.json({ zones: [] })

  // Charger les adresses de chaque zone
  const zones = []
  for (const z of zonesRaw) {
    const adresses: any[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('lat, lon, type_bien')
        .eq('zone_id', z.id)
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      adresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
    zones.push({ ...z, adresses })
  }

  return NextResponse.json({ zones })
}
