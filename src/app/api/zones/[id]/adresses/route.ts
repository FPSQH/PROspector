import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// GET /api/zones/[id]/adresses
// Retourne toutes les adresses assignées à une zone
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Vérifier que la zone appartient au commercial
  const { data: zone } = await supabase
    .from('zones_prospection')
    .select('id, commercial_id')
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!zone) return NextResponse.json({ error: 'Zone non trouvée' }, { status: 404 })

  // Charger les adresses par batches de 1000
  const allAdresses: any[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('adresses')
      .select('id, lat, lon, numero, nom_voie, type_bien, prospectable')
      .eq('zone_id', params.id)
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .range(from, from + 999)

    if (error || !data || data.length === 0) break
    allAdresses.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  return NextResponse.json({ adresses: allAdresses, nb: allAdresses.length })
}
