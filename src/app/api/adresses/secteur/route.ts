import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: communes } = await supabase
    .from('communes')
    .select('code_insee')
    .eq('commercial_id', user.id)

  if (!communes?.length) return NextResponse.json({ adresses: [] })

  const codesInsee = communes.map((c: any) => c.code_insee)

  // Charger toutes les adresses avec pagination
  const adresses: any[] = []
  const batchSize = 5
  for (let i = 0; i < codesInsee.length; i += batchSize) {
    const batch = codesInsee.slice(i, i + batchSize)
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('id, lat, lon, type_bien, prospectable, zone_id')
        .in('code_insee', batch)
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      adresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
  }

  return NextResponse.json({ adresses })
}
