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
      nb_portes, nb_boites, notes, created_at, type_session,
      commune_code_insee, commune_nom,
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
  const { zone_id, date_session, heure_debut, type_session, commune_code_insee, commune_nom } = body

  // ✅ zone_id facultatif pour les sessions hors_zone
  const isHorsZone = type_session === 'hors_zone' || (!zone_id && commune_code_insee)

  // Vérifier la zone si elle est fournie
  if (zone_id) {
    const { data: zone } = await supabase
      .from('zones_prospection')
      .select('id, nom')
      .eq('id', zone_id)
      .eq('commercial_id', user.id)
      .single()
    if (!zone) return NextResponse.json({ error: 'Zone non trouvee' }, { status: 404 })
  }

  const now         = new Date()
  const todayStr    = now.toISOString().split('T')[0]
  const dateSession = date_session ?? todayStr
  const heureDebut  = heure_debut  ?? now.toTimeString().slice(0, 5)

  const insertData: any = {
    commercial_id: user.id,
    date_session:  dateSession,
    heure_debut:   heureDebut,
    statut:        'en_cours',
    origine:       'manuel',
    type_session:  isHorsZone ? 'hors_zone' : 'libre',
    hors_zone:     isHorsZone,
  }

  if (zone_id)            insertData.zone_id             = zone_id
  if (commune_code_insee) insertData.commune_code_insee  = commune_code_insee
  if (commune_nom)        insertData.commune_nom         = commune_nom

  const { data: session, error } = await supabase
    .from('sessions_prospection')
    .insert(insertData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ✅ Lier à planning_sessions UNIQUEMENT si la zone est planifiée AUJOURD'HUI
  if (zone_id && !isHorsZone) {
    const { data: plannedToday } = await supabase
      .from('planning_sessions')
      .select('id')
      .eq('commercial_id', user.id)
      .eq('zone_id', zone_id)
      .eq('date_prevue', todayStr)
      .eq('statut', 'planifiee')
      .maybeSingle()

    if (plannedToday) {
      await supabase
        .from('planning_sessions')
        .update({ session_id: session.id, statut: 'realisee' })
        .eq('id', plannedToday.id)
      await supabase
        .from('sessions_prospection')
        .update({ type_session: 'zone' })
        .eq('id', session.id)
    }
  }

  return NextResponse.json({ session })
}
