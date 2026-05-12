import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const DEFAULT_JOURS = [2, 3, 5]
const DEFAULT_DEBUT = '10:00'
const DEFAULT_DUREE = 120

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return String(Math.floor(total / 60)).padStart(2,'0') + ':' + String(total % 60).padStart(2,'0')
}

async function getConfig(supabase: any, userId: string) {
  const { data } = await supabase
    .from('planning_config')
    .select('jours_semaine, heure_debut, duree_minutes')
    .eq('commercial_id', userId)
    .maybeSingle()
  return {
    jours: data?.jours_semaine ?? DEFAULT_JOURS,
    debut: data?.heure_debut   ?? DEFAULT_DEBUT,
    duree: data?.duree_minutes ?? DEFAULT_DUREE,
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

  const [sessionsRes, configRes, libresRes] = await Promise.all([
    // Sessions planifiées avec rapport via session_id
    supabase
      .from('planning_sessions')
      .select(`
        id, date_prevue, heure_debut, heure_fin, statut, zone_id, notes,
        nb_adresses_total, mois, annee, session_id,
        zones_prospection (id, nom, couleur, numero),
        sessions_prospection (rapport_json, nb_portes, nb_boites, nb_contacts_saisis, nb_qualifications, heure_debut_reel, heure_fin_reel)
      `)
      .eq('commercial_id', user.id)
      .eq('mois', mois)
      .eq('annee', annee)
      .order('date_prevue', { ascending: true }),

    getConfig(supabase, user.id),

    // Sessions libres (hors_zone / libre) réalisées ce mois
    supabase
      .from('sessions_prospection')
      .select(`
        id, date_session, type_session, commune_nom, statut,
        heure_debut_reel, heure_fin_reel,
        rapport_json, nb_portes, nb_boites, nb_contacts_saisis, nb_qualifications,
        zones_prospection (id, nom, couleur, numero)
      `)
      .eq('commercial_id', user.id)
      .eq('statut', 'realisee')
      .in('type_session', ['hors_zone', 'libre'])
      .gte('date_session', `${annee}-${String(mois).padStart(2,'0')}-01`)
      .lte('date_session', `${annee}-${String(mois).padStart(2,'0')}-31`),
  ])

  const sessions = (sessionsRes.data ?? []).map((s: any) => {
    const sp = s.sessions_prospection
    const rapport = sp?.rapport_json ?? {}
    return {
      ...s,
      rapport: {
        nb_visites:      rapport.nb_visites      ?? sp?.nb_portes           ?? 0,
        nb_contacts:     rapport.nb_contacts     ?? sp?.nb_contacts_saisis  ?? 0,
        nb_flyers:       rapport.nb_flyers       ?? sp?.nb_boites           ?? 0,
        nb_maisons:      rapport.nb_maisons      ?? 0,
        nb_immeubles:    rapport.nb_immeubles     ?? 0,
        nb_syndics:      rapport.nb_syndics       ?? 0,
        nb_qualifications: rapport.nb_qualifications ?? sp?.nb_qualifications ?? 0,
        contacts:        rapport.contacts         ?? [],
      },
    }
  })

  const libres = libresRes.data ?? []

  // KPIs mois (sessions planifiées uniquement)
  const nbPlanifiees = sessions.filter((s: any) => s.statut === 'planifiee').length
  const nbRealisees  = sessions.filter((s: any) => s.statut === 'realisee').length
  const nbAnnulees   = sessions.filter((s: any) => ['annulee','non_realisee'].includes(s.statut)).length
  // KPIs réalisées (rapport)
  const realiseesData = sessions.filter((s: any) => s.statut === 'realisee')
  const totalVisites  = realiseesData.reduce((acc: number, s: any) => acc + (s.rapport?.nb_visites ?? 0), 0)
    + libres.reduce((acc: number, s: any) => acc + (s.rapport_json?.nb_visites ?? s.nb_portes ?? 0), 0)
  const totalContacts = realiseesData.reduce((acc: number, s: any) => acc + (s.rapport?.nb_contacts ?? 0), 0)
    + libres.reduce((acc: number, s: any) => acc + (s.rapport_json?.nb_contacts ?? s.nb_contacts_saisis ?? 0), 0)
  const totalAdresses = sessions.reduce((acc: number, s: any) => acc + (s.nb_adresses_total ?? 0), 0)
  const pctRealise    = totalAdresses > 0 ? Math.round(totalVisites / totalAdresses * 100) : 0

  return NextResponse.json({
    planning: sessions,
    libres,
    mois, annee,
    config: configRes,
    kpis: { nbPlanifiees, nbRealisees, nbAnnulees, totalAdresses, totalVisites, totalContacts, pctRealise },
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

  // Config : utiliser override si fourni (prolongation avec params modifiés)
  const defaultCfg = await getConfig(supabase, user.id)
  const cfg = {
    jours: body.jours_semaine ?? defaultCfg.jours,
    debut: body.heure_debut   ?? defaultCfg.debut,
    duree: body.duree_minutes ?? defaultCfg.duree,
  }

  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, nb_adresses')
    .eq('commercial_id', user.id)
    .eq('statut', 'active')
    .order('numero', { ascending: true })

  if (!zones?.length)
    return NextResponse.json({ error: 'Aucune zone active' }, { status: 400 })

  // Adresses par zone
  const { data: adressesCounts } = await supabase
    .from('adresses')
    .select('zone_id')
    .in('zone_id', zones.map((z: any) => z.id))
  const countByZone = new Map<string, number>()
  for (const a of (adressesCounts ?? [])) {
    countByZone.set(a.zone_id, (countByZone.get(a.zone_id) ?? 0) + 1)
  }

  // Sessions existantes ce mois (pour ne pas écraser les réalisées / annulées)
  const { data: existing } = await supabase
    .from('planning_sessions')
    .select('id, date_prevue, statut, zone_id')
    .eq('commercial_id', user.id)
    .eq('mois', mois)
    .eq('annee', annee)

  const existingByDate = new Map((existing ?? []).map((s: any) => [s.date_prevue, s]))

  // Supprimer uniquement les sessions planifiées (pas réalisées ni annulées)
  const toDelete = (existing ?? [])
    .filter((s: any) => s.statut === 'planifiee')
    .map((s: any) => s.id)
  if (toDelete.length) {
    await supabase.from('planning_sessions').delete().in('id', toDelete)
  }

  // Déterminer l'index de départ des zones
  let zoneStartIndex = 0
  if (body.prolonger && body.from_mois && body.from_annee) {
    // Prolongation : partir après la dernière zone du mois précédent
    const { data: lastSession } = await supabase
      .from('planning_sessions')
      .select('zone_id')
      .eq('commercial_id', user.id)
      .eq('mois', body.from_mois)
      .eq('annee', body.from_annee)
      .order('date_prevue', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastSession?.zone_id) {
      const lastZoneIdx = (zones as any[]).findIndex((z: any) => z.id === lastSession.zone_id)
      if (lastZoneIdx >= 0) zoneStartIndex = (lastZoneIdx + 1) % zones.length
    }
  }

  const heureFin = addMinutes(cfg.debut, cfg.duree)
  const daysInMonth = new Date(annee, mois, 0).getDate()
  const sessions: any[] = []
  let zoneOffset = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const jourSemaine = new Date(annee, mois - 1, day).getDay()
    if (!cfg.jours.includes(jourSemaine)) continue

    const dateStr = `${annee}-${String(mois).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const existingForDay = existingByDate.get(dateStr)

    // Conserver les sessions réalisées ou annulées
    if (existingForDay && existingForDay.statut !== 'planifiee') {
      zoneOffset++ // La zone de ce jour a déjà été consommée — incrémenter pour la rotation
      continue
    }

    const zoneIdx = (zoneStartIndex + zoneOffset) % zones.length
    const zone = (zones as any[])[zoneIdx]
    zoneOffset++

    sessions.push({
      commercial_id:     user.id,
      zone_id:           zone.id,
      date_prevue:       dateStr,
      heure_debut:       cfg.debut,
      heure_fin:         heureFin,
      statut:            'planifiee',
      mois,
      annee,
      nb_adresses_total: countByZone.get(zone.id) ?? zone.nb_adresses ?? 0,
    })
  }

  if (!sessions.length && !existing?.length)
    return NextResponse.json({ error: 'Aucune session générée' }, { status: 400 })

  let inserted: any[] = []
  if (sessions.length) {
    const { data, error } = await supabase
      .from('planning_sessions')
      .insert(sessions)
      .select('id, date_prevue, heure_debut, heure_fin, statut, zone_id, nb_adresses_total, zones_prospection (id, nom, couleur, numero)')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = data ?? []
  }

  return NextResponse.json({ planning: inserted, nb_sessions: sessions.length, mois, annee })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mois  = parseInt(searchParams.get('mois')  ?? '0')
  const annee = parseInt(searchParams.get('annee') ?? '0')
  if (!mois || !annee) return NextResponse.json({ error: 'mois et annee requis' }, { status: 400 })

  // Supprimer uniquement les sessions planifiées — jamais les réalisées
  const { error } = await supabase
    .from('planning_sessions')
    .delete()
    .eq('commercial_id', user.id)
    .eq('mois', mois)
    .eq('annee', annee)
    .eq('statut', 'planifiee')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
