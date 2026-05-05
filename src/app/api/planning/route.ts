import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Valeurs par défaut si pas de config
const DEFAULT_JOURS    = [2, 3, 5] // mar, mer, ven
const DEFAULT_DEBUT    = '10:00'
const DEFAULT_DUREE    = 120 // minutes

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total  = h * 60 + m + minutes
  return String(Math.floor(total / 60)).padStart(2,'0') + ':' + String(total % 60).padStart(2,'0')
}

async function getConfig(supabase: any, userId: string) {
  const { data } = await supabase
    .from('planning_config')
    .select('jours_semaine, heure_debut, duree_minutes')
    .eq('commercial_id', userId)
    .maybeSingle()
  return {
    jours:  data?.jours_semaine ?? DEFAULT_JOURS,
    debut:  data?.heure_debut   ?? DEFAULT_DEBUT,
    duree:  data?.duree_minutes ?? DEFAULT_DUREE,
  }
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const mois  = parseInt(searchParams.get('mois')  ?? String(now.getMonth() + 1))
  const annee = parseInt(searchParams.get('annee') ?? String(now.getFullYear()))

  const [sessionsRes, configRes] = await Promise.all([
    supabase
      .from('planning_sessions')
      .select('id, date_prevue, heure_debut, heure_fin, statut, zone_id, notes, nb_adresses_total, nb_adresses_visitees, nb_contacts, zones_prospection (id, nom, couleur, numero)')
      .eq('commercial_id', user.id)
      .eq('mois', mois)
      .eq('annee', annee)
      .order('date_prevue', { ascending: true }),
    getConfig(supabase, user.id),
  ])

  const sessions = sessionsRes.data ?? []

  // KPIs du mois
  const nbPlanifiees    = sessions.filter((s: any) => s.statut === 'planifiee').length
  const nbRealisees     = sessions.filter((s: any) => s.statut === 'realisee').length
  const nbAnnulees      = sessions.filter((s: any) => ['annulee','non_realisee'].includes(s.statut)).length
  const totalAdresses   = sessions.reduce((s: number, x: any) => s + (x.nb_adresses_total ?? 0), 0)
  const visitees        = sessions.reduce((s: number, x: any) => s + (x.nb_adresses_visitees ?? 0), 0)
  const totalContacts   = sessions.reduce((s: number, x: any) => s + (x.nb_contacts ?? 0), 0)
  const pctRealise      = totalAdresses > 0 ? Math.round(visitees / totalAdresses * 100) : 0

  return NextResponse.json({
    planning: sessions,
    mois, annee,
    config:  configRes,
    kpis: { nbPlanifiees, nbRealisees, nbAnnulees, totalAdresses, visitees, totalContacts, pctRealise },
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const now   = new Date()
  const mois  = parseInt(body.mois  ?? now.getMonth() + 1)
  const annee = parseInt(body.annee ?? now.getFullYear())

  // Config personnalisée
  const cfg = await getConfig(supabase, user.id)

  const { data: existing } = await supabase
    .from('planning_sessions').select('id')
    .eq('commercial_id', user.id).eq('mois', mois).eq('annee', annee)
  if (existing && existing.length > 0)
    return NextResponse.json({ error: 'Planning deja genere pour ce mois', nb_sessions: existing.length }, { status: 409 })

  const { data: zones } = await supabase
    .from('zones_prospection').select('id, nom, numero, nb_adresses')
    .eq('commercial_id', user.id).eq('statut', 'active')
    .order('numero', { ascending: true })
  if (!zones?.length)
    return NextResponse.json({ error: 'Aucune zone active pour generer le planning' }, { status: 400 })

  // Compter les adresses par zone pour le suivi
  const { data: adressesCounts } = await supabase
    .from('adresses').select('zone_id')
    .in('zone_id', zones.map((z: any) => z.id))
  const countByZone = new Map<string, number>()
  for (const a of (adressesCounts ?? [])) {
    countByZone.set(a.zone_id, (countByZone.get(a.zone_id) ?? 0) + 1)
  }

  const sessions = []
  const daysInMonth = new Date(annee, mois, 0).getDate()
  const heureFin = addMinutes(cfg.debut, cfg.duree)
  let zoneIndex = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const jourSemaine = new Date(annee, mois - 1, day).getDay()
    if (!cfg.jours.includes(jourSemaine)) continue

    const zone    = zones[zoneIndex % zones.length]
    const dateStr = annee + '-' + String(mois).padStart(2,'0') + '-' + String(day).padStart(2,'0')

    sessions.push({
      commercial_id:        user.id,
      zone_id:              zone.id,
      date_prevue:          dateStr,
      heure_debut:          cfg.debut,
      heure_fin:            heureFin,
      statut:               'planifiee',
      mois,
      annee,
      nb_adresses_total:    countByZone.get(zone.id) ?? 0,
      nb_adresses_visitees: 0,
      nb_contacts:          0,
    })
    zoneIndex++
  }

  if (!sessions.length)
    return NextResponse.json({ error: 'Aucune session generee' }, { status: 400 })

  const { data: inserted, error } = await supabase
    .from('planning_sessions').insert(sessions)
    .select('id, date_prevue, heure_debut, heure_fin, statut, zone_id, nb_adresses_total, zones_prospection (id, nom, couleur, numero)')
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
    .from('planning_sessions').delete()
    .eq('commercial_id', user.id).eq('mois', mois).eq('annee', annee).eq('statut', 'planifiee')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
