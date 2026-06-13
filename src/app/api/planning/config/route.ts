import { getEffectiveCommercialId } from '@/lib/delegation'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const { data } = await supabase
    .from('planning_config').select('*').eq('commercial_id', effectiveId).maybeSingle()

  return NextResponse.json({
    jours_semaine:   data?.jours_semaine   ?? [2, 3, 5],
    heure_debut:     data?.heure_debut     ?? '10:00',
    duree_minutes:   data?.duree_minutes   ?? 120,
    date_debut:      data?.date_debut      ?? null,
    heure_debut_2:   data?.heure_debut_2   ?? null,
    jours_semaine_2: data?.jours_semaine_2 ?? [],
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const body = await req.json().catch(() => ({}))
  const { jours_semaine, heure_debut, duree_minutes, date_debut, heure_debut_2, jours_semaine_2 } = body

  const { data, error } = await supabase
    .from('planning_config')
    .upsert({
      commercial_id: effectiveId,
      jours_semaine,
      heure_debut,
      duree_minutes,
      date_debut:      date_debut    || null,
      heure_debut_2:   heure_debut_2 || null,
      jours_semaine_2: jours_semaine_2 ?? [],
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'commercial_id' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
