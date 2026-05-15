import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data } = await supabase
    .from('planning_config').select('*').eq('commercial_id', user.id).maybeSingle()

  return NextResponse.json({
    jours_semaine:         data?.jours_semaine          ?? [2, 3, 5],
    heure_debut:           data?.heure_debut             ?? '10:00',
    duree_minutes:         data?.duree_minutes            ?? 120,
    date_debut:            data?.date_debut               ?? null,
    deux_zones_par_seance: data?.deux_zones_par_seance   ?? false,
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { jours_semaine, heure_debut, duree_minutes, date_debut, deux_zones_par_seance } = body

  const { data, error } = await supabase
    .from('planning_config')
    .upsert({
      commercial_id:         user.id,
      jours_semaine,
      heure_debut,
      duree_minutes,
      date_debut:            date_debut || null,
      deux_zones_par_seance: !!deux_zones_par_seance,
      updated_at:            new Date().toISOString(),
    }, { onConflict: 'commercial_id' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
