import { getEffectiveCommercialId } from '@/lib/delegation'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const { searchParams } = new URL(req.url)
  const zone_id      = searchParams.get('zone_id')
  const statut       = searchParams.get('statut')
  const date_debut   = searchParams.get('date_debut')
  const date_fin     = searchParams.get('date_fin')
  const limit        = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 100)
  const offset       = parseInt(searchParams.get('offset') ?? '0', 10)

  const type_session_filter = searchParams.get('type_session') ?? ''

  let query = supabase
    .from('sessions_prospection')
    .select(`
      id, zone_id, date_session, heure_debut, heure_fin,
      heure_debut_reel, heure_fin_reel, statut, origine,
      nb_portes, nb_boites, notes, created_at, type_session,
      commune_code_insee, commune_nom, nom_tournee, adresse_ids,
      rapport_json,
      zones_prospection (nom, couleur, numero)
    `, { count: 'exact' })
    .eq('commercial_id', effectiveId)
    .order('date_session', { ascending: false })
    .range(offset, offset + limit - 1)

  if (zone_id)             query = query.eq('zone_id', zone_id)
  if (statut)              query = query.eq('statut', statut)
  if (type_session_filter) query = query.eq('type_session', type_session_filter)
  if (date_debut)          query = query.gte('date_session', date_debut)
  if (date_fin)            query = query.lte('date_session', date_fin)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data ?? [], total: count ?? 0 })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const body = await req.json().catch(() => ({}))
  const {
    zone_id, date_session, heure_debut, type_session, commune_code_insee, commune_nom,
    adresse_ids, nom_tournee, statut: statutBody,
  } = body

  const isDpeTour  = type_session === 'dpe'
  const isHorsZone = type_session === 'hors_zone' || (!zone_id && commune_code_insee && !isDpeTour)

  // Vérifier la zone si elle est fournie (pas nécessaire pour les tournées DPE)
  if (zone_id && !isDpeTour) {
    const { data: zone } = await supabase
      .from('zones_prospection')
      .select('id, nom')
      .eq('id', zone_id)
      .eq('commercial_id', effectiveId)
      .single()
    if (!zone) return NextResponse.json({ error: 'Zone non trouvee' }, { status: 404 })
  }

  const now         = new Date()
  const todayStr    = now.toISOString().split('T')[0]
  const dateSession = date_session ?? todayStr
  const heureDebut  = heure_debut  ?? now.toTimeString().slice(0, 5)

  // Pour les tournées DPE préparées, le statut peut être 'preparee'
  const statutFinal = isDpeTour ? (statutBody ?? 'preparee')
    : 'en_cours'

  const insertData: any = {
    commercial_id: effectiveId,
    date_session:  dateSession,
    heure_debut:   heureDebut,
    statut:        statutFinal,
    origine:       'manuel',
    type_session:  isDpeTour ? 'dpe' : isHorsZone ? 'hors_zone' : 'libre',
    hors_zone:     isHorsZone,
  }

  if (zone_id)            insertData.zone_id             = zone_id
  if (commune_code_insee) insertData.commune_code_insee  = commune_code_insee
  if (commune_nom)        insertData.commune_nom         = commune_nom
  if (nom_tournee)        insertData.nom_tournee         = nom_tournee
  if (adresse_ids?.length) insertData.adresse_ids        = adresse_ids

  const { data: session, error } = await supabase
    .from('sessions_prospection')
    .insert(insertData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ✅ Lier à planning_sessions UNIQUEMENT si la zone est planifiée AUJOURD'HUI (pas pour les tournées DPE)
  if (zone_id && !isHorsZone && !isDpeTour) {
    const { data: plannedToday } = await supabase
      .from('planning_sessions')
      .select('id')
      .eq('commercial_id', effectiveId)
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
