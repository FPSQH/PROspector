import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Route dediee pour l'overlay DPE dans l'editeur de zones
// Retourne les DPE recents du secteur avec leur anciennete (chaud/tiede/ancien)
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mois = parseInt(searchParams.get('mois') ?? '12')

  const { data: communes } = await supabase
    .from('communes')
    .select('code_insee')
    .eq('commercial_id', user.id)

  if (!communes?.length) return NextResponse.json({ points: [] })

  const codesInsee = communes.map((c: any) => c.code_insee)
  const since = new Date()
  since.setMonth(since.getMonth() - mois)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data: dpeRows } = await supabase
    .from('dpe_logement')
    .select('adresse_id, date_etablissement, adresses!inner(lat, lon)')
    .in('code_insee', codesInsee)
    .not('adresse_id', 'is', null)
    .gte('date_etablissement', sinceStr)

  const now = Date.now()
  const oneMoisMs = 30 * 24 * 60 * 60 * 1000

  const points = (dpeRows ?? []).map((dpe: any) => {
    const ageMs = now - new Date(dpe.date_etablissement).getTime()
    const anciennete = ageMs <= oneMoisMs ? 'chaud' : 'tiede'
    return {
      lat:         dpe.adresses?.lat,
      lon:         dpe.adresses?.lon,
      anciennete,
      date:        dpe.date_etablissement,
    }
  }).filter((p: any) => p.lat && p.lon)

  return NextResponse.json({ points })
}
