import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Jours de prospection : 2=mardi, 3=mercredi, 5=vendredi
const JOURS_PROSPECTION = [2, 3, 5]
const HEURE_DEBUT = '10:00'
const HEURE_FIN   = '12:00'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const mois  = parseInt(searchParams.get('mois')  ?? String(now.getMonth() + 1))
  const annee = parseInt(searchParams.get('annee') ?? String(now.getFullYear()))

  const { data, error } = await supabase
    .from('planning_sessions')
    .select('id, date_prevue, heure_debut, heure_fin, statut, session_id, zone_id, zones_prospection (id, nom, couleur, numero)')
    .eq('commercial_id', user.id)
    .eq('mois', mois)
    .eq('annee', annee)
    .order('date_prevue', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ planning: data ?? [], mois, annee })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const now   = new Date()
  const mois  = parseInt(body.mois  ?? now.getMonth() + 1)
  const annee = parseInt(body.annee ?? now.getFullYear())

  // Vérifier si déjà généré ce mois
  const { data: existing } = await supabase
    .from('planning_sessions')
    .select('id')
    .eq('commercial_id', user.id)
    .eq('mois', mois)
    .eq('annee', annee)
  if (existing && existing.length > 0)
    return NextResponse.json({ error: 'Planning deja genere pour ce mois', nb_sessions: existing.length }, { status: 409 })

  // Charger les zones actives
  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero')
    .eq('commercial_id', user.id)
    .eq('statut', 'active')
    .order('numero', { ascending: true })

  if (!zones?.length)
    return NextResponse.json({ error: 'Aucune zone active pour generer le planning' }, { status: 400 })

  // Générer les dates du mois pour les jours de prospection
  const sessions = []
  const daysInMonth = new Date(annee, mois, 0).getDate()
  let zoneIndex = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(annee, mois - 1, day)
    const jourSemaine = date.getDay() // 0=dim, 1=lun, ...

    if (!JOURS_PROSPECTION.includes(jourSemaine)) continue

    const zone = zones[zoneIndex % zones.length]
    const dateStr = annee + '-' + String(mois).padStart(2,'0') + '-' + String(day).padStart(2,'0')

    sessions.push({
      commercial_id: user.id,
      zone_id:       zone.id,
      date_prevue:   dateStr,
      heure_debut:   HEURE_DEBUT,
      heure_fin:     HEURE_FIN,
      statut:        'planifiee',
      mois,
      annee,
    })
    zoneIndex++
  }

  if (!sessions.length)
    return NextResponse.json({ error: 'Aucune session generee' }, { status: 400 })

  const { data: inserted, error } = await supabase
    .from('planning_sessions')
    .insert(sessions)
    .select('id, date_prevue, statut, zone_id, zones_prospection (id, nom, couleur, numero)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ planning: inserted ?? [], nb_sessions: sessions.length, mois, annee })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mois  = parseInt(searchParams.get('mois')  ?? '0')
  const annee = parseInt(searchParams.get('annee') ?? '0')
  if (!mois || !annee) return NextResponse.json({ error: 'mois et annee requis' }, { status: 400 })

  const { error } = await supabase
    .from('planning_sessions')
    .delete()
    .eq('commercial_id', user.id)
    .eq('mois', mois)
    .eq('annee', annee)
    .eq('statut', 'planifiee') // ne supprimer que les planifiees, pas les réalisées

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
