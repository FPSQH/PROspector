import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/sessions?zone_id=&statut=
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

// POST /api/sessions — démarrer une session
// Body : { zone_id, date_session?, heure_debut? }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { zone_id, date_session, heure_debut } = body

  if (!zone_id) return NextResponse.json({ error: 'zone_id requis' }, { status: 400 })

  // Vérifier que la zone appartient au commercial
  const { data: zone } = await supabase
    .from('zones_prospection')
    .select('id, nom')
    .eq('id', zone_id)
    .eq('commercial_id', user.id)
    .single()

  if (!zone) return NextResponse.json({ error: 'Zone non trouvee' }, { status: 404 })

  const now         = new Date()
  const dateSession = date_session ?? now.toISOString().split('T')[0]
  const heureDebut  = heure_debut  ?? now.toTimeString().slice(0, 5)

  const { data: session, error } = await supabase
    .from('sessions_prospection')
    .insert({
      commercial_id:   user.id,
      zone_id,
      date_session:    dateSession,
      heure_debut:     heureDebut,
      heure_debut_reel: heureDebut,
      statut:          'en_cours',
      origine:         'manuel',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Lier au planning si une entrée existe pour ce mois
  const mois  = now.getMonth() + 1
  const annee = now.getFullYear()
  await supabase
    .from('planning_sessions')
    .update({ session_id: session.id, statut: 'realisee' })
    .eq('commercial_id', user.id)
    .eq('zone_id', zone_id)
    .eq('mois', mois)
    .eq('annee', annee)
    .eq('statut', 'planifiee')

  return NextResponse.json({ session })
}
