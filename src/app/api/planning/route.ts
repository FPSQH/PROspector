import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const DEFAULT_JOURS    = [2, 3, 5]
const DEFAULT_DEBUT    = '10:00'
const DEFAULT_DUREE    = 120
const DEFAULT_SESSIONS = 1

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total  = h * 60 + m + minutes
  return String(Math.floor(total / 60)).padStart(2,'0') + ':' + String(total % 60).padStart(2,'0')
}

async function getConfig(supabase: any, userId: string) {
  const { data } = await supabase
    .from('planning_config')
    .select('jours_semaine, heure_debut, duree_minutes, date_debut, nb_sessions_par_jour, heure_debut_2, heure_debut_3')
    .eq('commercial_id', userId)
    .maybeSingle()
  return {
    jours:                data?.jours_semaine        ?? DEFAULT_JOURS,
    debut:                data?.heure_debut           ?? DEFAULT_DEBUT,
    duree:                data?.duree_minutes         ?? DEFAULT_DUREE,
    date_debut:           data?.date_debut            ?? null,
    nb_sessions_par_jour: data?.nb_sessions_par_jour  ?? DEFAULT_SESSIONS,
    heure_debut_2:        data?.heure_debut_2          ?? null,
    heure_debut_3:        data?.heure_debut_3          ?? null,
  }
}

// GET /api/planning
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
      .select('id, date_prevue, heure_debut, heure_fin, statut, zone_id, notes, nb_adresses_total, nb_adresses_visitees, nb_contacts, nb_maisons_qualifiees, nb_immeubles_qualifies, nb_syndics_qualifies, nb_adresses_supprimees, zones_prospection (id, nom, couleur, numero)')
      .eq('commercial_id', user.id)
      .eq('mois', mois)
      .eq('annee', annee)
      .order('date_prevue', { ascending: true })
      .order('heure_debut', { ascending: true }),
    getConfig(supabase, user.id),
  ])

  const sessions = sessionsRes.data ?? []
  const nbPlanifiees  = sessions.filter((s: any) => s.statut === 'planifiee').length
  const nbRealisees   = sessions.filter((s: any) => s.statut === 'realisee').length
  const nbAnnulees    = sessions.filter((s: any) => ['annulee','non_realisee'].includes(s.statut)).length
  const totalAdresses = sessions.reduce((s: number, x: any) => s + (x.nb_adresses_total ?? 0), 0)
  const visitees      = sessions.reduce((s: number, x: any) => s + (x.nb_adresses_visitees ?? 0), 0)
  const totalContacts = sessions.reduce((s: number, x: any) => s + (x.nb_contacts ?? 0), 0)
  const pctRealise    = totalAdresses > 0 ? Math.round(visitees / totalAdresses * 100) : 0

  return NextResponse.json({
    planning: sessions, mois, annee,
    config: configRes,
    kpis: { nbPlanifiees, nbRealisees, nbAnnulees, totalAdresses, visitees, totalContacts, pctRealise },
  })
}

// POST /api/planning — générer le planning
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body  = await req.json().catch(() => ({}))
  const now   = new Date()
  const mois  = parseInt(body.mois  ?? now.getMonth() + 1)
  const annee = parseInt(body.annee ?? now.getFullYear())

  const cfg = await getConfig(supabase, user.id)

  const { data: existing } = await supabase
    .from('planning_sessions').select('id')
    .eq('commercial_id', user.id).eq('mois', mois).eq('annee', annee)
  if (existing && existing.length > 0)
    return NextResponse.json({ error: 'Planning deja genere pour ce mois', nb_sessions: existing.length }, { status: 409 })

  const { data: zones } = await supabase
    .from('zones_prospection').select('id, nom, numero')
    .eq('commercial_id', user.id).eq('statut', 'active')
    .order('numero', { ascending: true })
  if (!zones?.length)
    return NextResponse.json({ error: 'Aucune zone active pour generer le planning' }, { status: 400 })

  const { data: adressesCounts } = await supabase
    .from('adresses').select('zone_id')
    .in('zone_id', zones.map((z: any) => z.id))
  const countByZone = new Map<string, number>()
  for (const a of (adressesCounts ?? [])) {
    countByZone.set(a.zone_id, (countByZone.get(a.zone_id) ?? 0) + 1)
  }

  // Date de début = max(date_debut_config, aujourd'hui)
  let startDay = 1
  if (cfg.date_debut) {
    const dd = new Date(cfg.date_debut + 'T12:00:00')
    if (dd.getFullYear() === annee && dd.getMonth() + 1 === mois) {
      startDay = dd.getDate()
    }
  }
  if (annee === now.getFullYear() && mois === now.getMonth() + 1) {
    startDay = Math.max(startDay, now.getDate())
  }

  const nbSessionsParJour = Math.max(1, Math.min(3, cfg.nb_sessions_par_jour))
  const daysInMonth = new Date(annee, mois, 0).getDate()

  // Construire les slots horaires
  const debutSlots = [
    cfg.debut,
    cfg.heure_debut_2 ?? addMinutes(cfg.debut, cfg.duree + 60),
    cfg.heure_debut_3 ?? addMinutes(cfg.debut, cfg.duree * 2 + 120),
  ]
  const slots = debutSlots.slice(0, nbSessionsParJour).map(d => ({
    debut: d,
    fin:   addMinutes(d, cfg.duree),
  }))

  const sessions: any[] = []
  let zoneIndex = 0

  for (let day = startDay; day <= daysInMonth; day++) {
    const jourSemaine = new Date(annee, mois - 1, day).getDay()
    if (!cfg.jours.includes(jourSemaine)) continue
    const dateStr = `${annee}-${String(mois).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    for (let slot = 0; slot < nbSessionsParJour; slot++) {
      const zone = zones[zoneIndex % zones.length]
      sessions.push({
        commercial_id:           user.id,
        zone_id:                 zone.id,
        date_prevue:             dateStr,
        heure_debut:             slots[slot].debut,
        heure_fin:               slots[slot].fin,
        statut:                  'planifiee',
        mois, annee,
        nb_adresses_total:       countByZone.get(zone.id) ?? 0,
        nb_adresses_visitees:    0,
        nb_contacts:             0,
        nb_maisons_qualifiees:   0,
        nb_immeubles_qualifies:  0,
        nb_syndics_qualifies:    0,
        nb_adresses_supprimees:  0,
      })
      zoneIndex++
    }
  }

  if (!sessions.length)
    return NextResponse.json({ error: 'Aucune session générée — aucun jour configuré à partir d\'aujourd\'hui sur ce mois' }, { status: 400 })

  const { data: inserted, error } = await supabase
    .from('planning_sessions').insert(sessions)
    .select('id, date_prevue, heure_debut, heure_fin, statut, zone_id, nb_adresses_total, nb_adresses_visitees, nb_contacts, nb_maisons_qualifiees, nb_immeubles_qualifies, nb_syndics_qualifies, nb_adresses_supprimees, zones_prospection (id, nom, couleur, numero)')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const planSessions = inserted ?? []
  return NextResponse.json({
    planning: planSessions,
    nb_sessions: sessions.length,
    mois, annee,
    kpis: {
      nbPlanifiees: planSessions.length, nbRealisees: 0, nbAnnulees: 0,
      totalAdresses: planSessions.reduce((s: number, x: any) => s + (x.nb_adresses_total ?? 0), 0),
      visitees: 0, totalContacts: 0, pctRealise: 0,
    },
  })
}

// PATCH /api/planning — reporter les sessions planifiées après une date
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { date_reference, nb_jours } = await req.json().catch(() => ({}))
  if (!date_reference || !nb_jours)
    return NextResponse.json({ error: 'date_reference et nb_jours requis' }, { status: 400 })

  const { data: sessions } = await supabase
    .from('planning_sessions')
    .select('id, date_prevue')
    .eq('commercial_id', user.id)
    .eq('statut', 'planifiee')
    .gt('date_prevue', date_reference)
    .order('date_prevue', { ascending: true })

  if (!sessions?.length) return NextResponse.json({ ok: true, nb: 0 })

  for (const s of sessions) {
    const d = new Date(s.date_prevue + 'T12:00:00')
    d.setDate(d.getDate() + nb_jours)
    await supabase.from('planning_sessions')
      .update({ date_prevue: d.toISOString().split('T')[0], mois: d.getMonth() + 1, annee: d.getFullYear() })
      .eq('id', s.id).eq('commercial_id', user.id)
  }

  return NextResponse.json({ ok: true, nb: sessions.length })
}

// DELETE /api/planning — reset planifiées (défaut) ou reset complet (?full=true)
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mois  = parseInt(searchParams.get('mois')  ?? '0')
  const annee = parseInt(searchParams.get('annee') ?? '0')
  const full  = searchParams.get('full') === 'true'
  if (!mois || !annee) return NextResponse.json({ error: 'mois et annee requis' }, { status: 400 })

  if (full) {
    const { error } = await supabase.from('planning_sessions').delete()
      .eq('commercial_id', user.id).eq('mois', mois).eq('annee', annee)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('planning_sessions').delete()
      .eq('commercial_id', user.id).eq('mois', mois).eq('annee', annee).eq('statut', 'planifiee')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
