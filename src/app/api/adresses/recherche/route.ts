import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ adresses: [] })

  // Récupérer les communes du commercial
  const { data: communes } = await supabase
    .from('communes')
    .select('code_insee')
    .eq('commercial_id', user.id)

  if (!communes?.length) return NextResponse.json({ adresses: [] })

  const codesInsee = communes.map((c: any) => c.code_insee)
  const like = `%${q}%`

  const { data, error } = await supabase
    .from('adresses')
    .select('id, numero, nom_voie, code_postal, commune, lat, lon, zone_id, zones_prospection(id, nom, couleur)')
    .in('code_insee', codesInsee)
    .or(`nom_voie.ilike.${like},commune.ilike.${like}`)
    .order('nom_voie', { ascending: true })
    .limit(12)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ adresses: data ?? [] })
}
