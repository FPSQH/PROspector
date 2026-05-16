import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const zone_id = searchParams.get('zone_id')
  const statut  = searchParams.get('statut')

  let query = supabase
    .from('sessions_prospection')
    .select(`
      id, zone_id, date_session, heure_debut, heure_fin,
      heure_debut_reel, heure_fin_reel, statut, origine,
      nb_portes, nb_boites, notes, created_at,
      zones_prospection (nom, couleur, numero)
    `)
    .eq('commercial_id', user.id)
    .order('date_session', { ascending: false })
    .limit(50)

  if (zone_id) query = query.eq('zone_id', zone_id)
  if (statut)  query = query.eq('statut', statut)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { zone_id, date_session, heure_debut } = body

  if (!zone_id) return NextResponse.json({ error: 'zone_id requis' }, { status: 400 })

  const { data: zone } = await supabase
    .from('zones_prospection')
    .select('id, nom')
    .eq('id', zone_id)
    .eq('commercial_id', user.id)
    .single()

  if (!zone) return NextResponse.json({ error: 'Zone non trouvee' }, { status: 404 })

  const now         = new Date()
  const todayStr    = now.toISOString().split('T')[0]          // ← TOUJOURS la date du jour
  const dateSession = date_session ?? todayStr                  // ← jamais de date future par défaut
  const heureDebut  = heure_debut  ?? now.toTimeString().slice(0, 5)

  const { data: session, error } = await supabase
    .from('sessions_prospection')
    .insert({
      commercial_id: user.id,
      zone_id,
      date_session:  dateSession,
      heure_debut:   heureDebut,
      statut:        'en_cours',
      origine:       'manuel',
      type_session:  'libre',   // ← session libre par défaut
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ✅ CORRECTION : ne lier à planning_sessions QUE si la session est planifiée AUJOURD'HUI
  // (évite de marquer une session du 19 mai comme réalisée quand on est le 16)
  const { data: plannedToday } = await supabase
    .from('planning_sessions')
    .select('id')
    .eq('commercial_id', user.id)
    .eq('zone_id', zone_id)
    .eq('date_prevue', todayStr)   // ← seulement si c'est prévu aujourd'hui
    .eq('statut', 'planifiee')
    .maybeSingle()

  if (plannedToday) {
    // La session était planifiée aujourd'hui → on la lie et marque réalisée
    await supabase
      .from('planning_sessions')
      .update({ session_id: session.id, statut: 'realisee' })
      .eq('id', plannedToday.id)

    // Mise à jour du type_session pour indiquer qu'elle était planifiée
    await supabase
      .from('sessions_prospection')
      .update({ type_session: 'zone' })
      .eq('id', session.id)
  }
  // Sinon : la session reste 'libre' — elle apparaîtra dans le planning comme session libre du jour

  return NextResponse.json({ session })
}
