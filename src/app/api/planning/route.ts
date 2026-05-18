import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function addMinutes(t: string, m: number): string {
  const [h, mn] = t.split(':').map(Number)
  const tot = h * 60 + mn + m
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
}

async function getConfig(supabase: any, userId: string) {
  const { data } = await supabase
    .from('planning_config').select('*').eq('commercial_id', userId).maybeSingle()
  return {
    jours:      (data?.jours_semaine   ?? [2, 3, 5]) as number[],
    debut:      (data?.heure_debut     ?? '10:00')   as string,
    duree:      (data?.duree_minutes   ?? 120)        as number,
    date_debut: (data?.date_debut      ?? null)       as string | null,
    debut_2:    (data?.heure_debut_2   ?? null)       as string | null,
    jours_2:    (data?.jours_semaine_2 ?? [])         as number[],
  }
}

const SESSION_SELECT =
  '*, zones_prospection:zone_id(id,nom,couleur,numero), ' +
  'session_data:session_id(rapport_json,commune_nom,commune_code_insee,statut,heure_debut,heure_fin)'

async function fetchSessions(supabase: any, userId: string, mois: number, annee: number) {
  const { data, error } = await supabase
    .from('planning_sessions')
    .select(SESSION_SELECT)
    .eq('commercial_id', userId)
    .eq('mois', mois)
    .eq('annee', annee)
    .order('date_prevue', { ascending: true })
    .order('heure_debut',  { ascending: true })

  if (!error) return data ?? []

  // Fallback sans join session_data (FK pas encore déclarée)
  console.warn('[Planning] Fallback sans session_data:', error.message)
  const { data: fallback } = await supabase
    .from('planning_sessions')
    .select('*, zones_prospection:zone_id(id,nom,couleur,numero)')
    .eq('commercial_id', userId)
    .eq('mois', mois)
    .eq('annee', annee)
    .order('date_prevue', { ascending: true })
    .order('heure_debut',  { ascending: true })
  return fallback ?? []
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const mois  = parseInt(searchParams.get('mois')  ?? String(now.getMonth() + 1))
  const annee = parseInt(searchParams.get('annee') ?? String(now.getFullYear()))

  const cfg = await getConfig(supabase, user.id)
  const s   = await fetchSessions(supabase, user.id, mois, annee)

  // Plage du mois
  const daysInMonth = new Date(annee, mois, 0).getDate()
  const firstDay    = `${annee}-${String(mois).padStart(2, '0')}-01`
  const lastDay     = `${annee}-${String(mois).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  // ✅ Toutes les sessions_prospection réalisées du mois (pas seulement hors_zone)
  const { data: allSessProsp } = await supabase
    .from('sessions_prospection')
    .select('id, date_session, commune_nom, commune_code_insee, rapport_json, statut, heure_debut, heure_fin, zone_id, type_session')
    .eq('commercial_id', user.id)
    .eq('statut',        'realisee')
    .gte('date_session', firstDay)
    .lte('date_session', lastDay)
    .order('date_session', { ascending: true })

  // Exclure celles déjà liées à une planning_session
  const linkedIds    = new Set(s.filter((x: any) => x.session_id).map((x: any) => x.session_id))
  const sessionsLibres = (allSessProsp ?? []).filter((sp: any) => !linkedIds.has(sp.id))

  const nbPlanifiees  = s.filter((x: any) => x.statut === 'planifiee').length
  const nbRealisees   = s.filter((x: any) => x.statut === 'realisee').length
  const nbAnnulees    = s.filter((x: any) => x.statut === 'annulee').length
  const totalAdresses = s.reduce((a: number, x: any) => a + (x.nb_adresses_total    ?? 0), 0)
  const visitees      = s.reduce((a: number, x: any) => a + (x.nb_adresses_visitees ?? 0), 0)
  const totalContacts = s.reduce((a: number, x: any) => a + (x.nb_contacts          ?? 0), 0)
  const pctRealise    = totalAdresses > 0 ? Math.round(visitees / totalAdresses * 100) : 0

  // ── Relances contacts du mois ──────────────────────────────────────────────
  const { data: relancesRaw } = await supabase
    .from('contacts')
    .select(`
      id, nom, prenom, tel1, tel2, email1,
      type_contact, notes, date_relance, statut_pipeline, horizon_vente,
      adresses ( id, numero, nom_voie, code_postal, commune )
    `)
    .eq('commercial_id', user.id)
    .not('date_relance', 'is', null)
    .gte('date_relance', firstDay)
    .lte('date_relance', lastDay)
    .order('date_relance', { ascending: true })

  const relances = relancesRaw ?? []

  return NextResponse.json({
    planning:        s,
    sessions_libres: sessionsLibres,
    relances,
    mois, annee,
    config: {
      jours_semaine:   cfg.jours,
      heure_debut:     cfg.debut,
      duree_minutes:   cfg.duree,
      date_debut:      cfg.date_debut,
      heure_debut_2:   cfg.debut_2,
      jours_semaine_2: cfg.jours_2,
    },
    kpis: { nbPlanifiees, nbRealisees, nbAnnulees, totalAdresses, visitees, totalContacts, pctRealise },
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body  = await req.json().catch(() => ({}))
  const now   = new Date()
  const mois  = parseInt(body.mois  ?? now.getMonth() + 1)
  const annee = parseInt(body.annee ?? now.getFullYear())

  const cfg = await getConfig(supabase, user.id)

  // Vérifier sessions planifiées existantes
  const { data: existing } = await supabase
    .from('planning_sessions').select('id')
    .eq('commercial_id', user.id).eq('mois', mois).eq('annee', annee).eq('statut', 'planifiee')
  if (existing && existing.length > 0)
    return NextResponse.json(
      { error: 'Des sessions planifiées existent déjà ce mois. Utilisez Reset pour les supprimer.', nb_sessions: existing.length },
      { status: 409 }
    )

  const { data: zones } = await supabase
    .from('zones_prospection').select('id, nom, numero, nb_adresses')
    .eq('commercial_id', user.id).eq('statut', 'active')
    .order('numero', { ascending: true })
  if (!zones?.length)
    return NextResponse.json({ error: 'Aucune zone active' }, { status: 400 })

  const { data: adressesCounts } = await supabase
    .from('adresses').select('zone_id')
    .in('zone_id', zones.map((z: any) => z.id))
  const countByZone = new Map<string, number>()
  for (const a of (adressesCounts ?? []))
    countByZone.set(a.zone_id, (countByZone.get(a.zone_id) ?? 0) + 1)

  const todayStr   = new Date().toISOString().split('T')[0]
  const todayDay   = now.getDate()

  // Date de début configurée — ignorée si dans le passé
  const rawDebut   = cfg.date_debut && cfg.date_debut >= todayStr ? cfg.date_debut : null
  const dateDebut  = rawDebut ? new Date(rawDebut + 'T12:00:00') : null
  const configDay  = (dateDebut && dateDebut.getFullYear() === annee && dateDebut.getMonth() + 1 === mois)
    ? dateDebut.getDate() : 1

  // ✅ CORRECTION : ne jamais planifier avant aujourd'hui pour le mois en cours
  const isCurrentMonth = (annee === now.getFullYear() && mois === (now.getMonth() + 1))
  const startDay = isCurrentMonth
    ? Math.max(configDay, todayDay)   // jamais antérieur à la date du jour
    : configDay                        // mois futur → date de début ou 1er du mois

  const daysInMonth = new Date(annee, mois, 0).getDate()
  const heureFin1   = addMinutes(cfg.debut, cfg.duree)
  const heureFin2   = cfg.debut_2 ? addMinutes(cfg.debut_2, cfg.duree) : null
  const toInsert: any[] = []
  let zoneIndex = 0

  for (let day = startDay; day <= daysInMonth; day++) {
    const jourSemaine = new Date(annee, mois - 1, day).getDay()
    const dateStr     = `${annee}-${String(mois).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const base        = { commercial_id: user.id, date_prevue: dateStr, statut: 'planifiee', mois, annee, nb_adresses_visitees: 0, nb_contacts: 0 }

    if (cfg.jours.includes(jourSemaine)) {
      const zone = zones[zoneIndex % zones.length]
      toInsert.push({ ...base, zone_id: zone.id, heure_debut: cfg.debut, heure_fin: heureFin1, nb_adresses_total: countByZone.get(zone.id) ?? 0 })
      zoneIndex++
    }

    if (cfg.debut_2 && heureFin2 && cfg.jours_2.includes(jourSemaine)) {
      const zone = zones[zoneIndex % zones.length]
      toInsert.push({ ...base, zone_id: zone.id, heure_debut: cfg.debut_2, heure_fin: heureFin2, nb_adresses_total: countByZone.get(zone.id) ?? 0 })
      zoneIndex++
    }
  }

  if (!toInsert.length)
    return NextResponse.json({ error: 'Aucune session à générer — vérifiez la date de début et les jours sélectionnés' }, { status: 400 })

  const { error: insErr } = await supabase.from('planning_sessions').insert(toInsert)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const s = await fetchSessions(supabase, user.id, mois, annee)
  return NextResponse.json({
    planning:        s,
    sessions_libres: [],
    kpis: {
      nbPlanifiees: s.filter((x: any) => x.statut === 'planifiee').length,
      nbRealisees:  s.filter((x: any) => x.statut === 'realisee').length,
      nbAnnulees:   0,
      totalAdresses: s.reduce((a: number, x: any) => a + (x.nb_adresses_total ?? 0), 0),
      visitees: 0, totalContacts: 0, pctRealise: 0,
    },
  })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  await supabase.from('planning_sessions').delete()
    .eq('commercial_id', user.id)
    .eq('mois',   parseInt(searchParams.get('mois')  ?? '0'))
    .eq('annee',  parseInt(searchParams.get('annee') ?? '0'))
    .eq('statut', 'planifiee')
  return NextResponse.json({ ok: true })
}
