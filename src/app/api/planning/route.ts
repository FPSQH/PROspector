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
    jours:                 (data?.jours_semaine          ?? [2, 3, 5]) as number[],
    debut:                 (data?.heure_debut             ?? '10:00')  as string,
    duree:                 (data?.duree_minutes            ?? 120)      as number,
    date_debut:            (data?.date_debut               ?? null)     as string | null,
    deux_zones:            (data?.deux_zones_par_seance   ?? false)    as boolean,
  }
}

// Join standard pour toutes les requêtes sessions
const SESSION_SELECT =
  '*, zones_prospection:zone_id(id,nom,couleur,numero), zone2:zone_id_2(id,nom,couleur,numero)'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const mois  = parseInt(searchParams.get('mois')  ?? String(now.getMonth() + 1))
  const annee = parseInt(searchParams.get('annee') ?? String(now.getFullYear()))

  const cfg = await getConfig(supabase, user.id)

  const { data: sessions } = await supabase
    .from('planning_sessions')
    .select(SESSION_SELECT)
    .eq('commercial_id', user.id)
    .eq('mois', mois)
    .eq('annee', annee)
    .order('date_prevue', { ascending: true })

  const s = sessions ?? []
  const nbPlanifiees  = s.filter((x: any) => x.statut === 'planifiee').length
  const nbRealisees   = s.filter((x: any) => x.statut === 'realisee').length
  const nbAnnulees    = s.filter((x: any) => x.statut === 'annulee').length
  const totalAdresses = s.reduce((acc: number, x: any) => acc + (x.nb_adresses_total    ?? 0), 0)
  const visitees      = s.reduce((acc: number, x: any) => acc + (x.nb_adresses_visitees ?? 0), 0)
  const totalContacts = s.reduce((acc: number, x: any) => acc + (x.nb_contacts          ?? 0), 0)
  const pctRealise    = totalAdresses > 0 ? Math.round(visitees / totalAdresses * 100) : 0

  return NextResponse.json({
    planning: s,
    mois,
    annee,
    config: {
      jours_semaine:         cfg.jours,
      heure_debut:           cfg.debut,
      duree_minutes:         cfg.duree,
      date_debut:            cfg.date_debut,
      deux_zones_par_seance: cfg.deux_zones,
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

  // Vérifier qu'il n'existe pas déjà des sessions ce mois
  const { data: existing } = await supabase
    .from('planning_sessions').select('id')
    .eq('commercial_id', user.id).eq('mois', mois).eq('annee', annee)
  if (existing && existing.length > 0)
    return NextResponse.json(
      { error: 'Planning déjà généré pour ce mois', nb_sessions: existing.length },
      { status: 409 }
    )

  // Zones actives triées par numéro
  const { data: zones } = await supabase
    .from('zones_prospection').select('id, nom, numero, nb_adresses')
    .eq('commercial_id', user.id).eq('statut', 'active')
    .order('numero', { ascending: true })
  if (!zones?.length)
    return NextResponse.json(
      { error: 'Aucune zone active pour générer le planning' },
      { status: 400 }
    )

  // Compter les adresses par zone
  const { data: adressesCounts } = await supabase
    .from('adresses').select('zone_id')
    .in('zone_id', zones.map((z: any) => z.id))
  const countByZone = new Map<string, number>()
  for (const a of (adressesCounts ?? [])) {
    countByZone.set(a.zone_id, (countByZone.get(a.zone_id) ?? 0) + 1)
  }

  // Jour de départ : respecter date_debut si elle est dans le mois demandé
  const dateDebut  = cfg.date_debut ? new Date(cfg.date_debut + 'T12:00:00') : null
  const startDay   = (dateDebut &&
    dateDebut.getFullYear() === annee &&
    dateDebut.getMonth() + 1 === mois)
    ? dateDebut.getDate()
    : 1

  const daysInMonth = new Date(annee, mois, 0).getDate()
  const heureFin    = addMinutes(cfg.debut, cfg.duree)
  const toInsert: any[] = []
  let zoneIndex = 0

  for (let day = startDay; day <= daysInMonth; day++) {
    const jourSemaine = new Date(annee, mois - 1, day).getDay()
    if (!cfg.jours.includes(jourSemaine)) continue

    const dateStr = `${annee}-${String(mois).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const zone1   = zones[zoneIndex % zones.length]
    const zone2   = cfg.deux_zones ? zones[(zoneIndex + 1) % zones.length] : null

    toInsert.push({
      commercial_id:        user.id,
      zone_id:              zone1.id,
      zone_id_2:            zone2?.id ?? null,
      date_prevue:          dateStr,
      heure_debut:          cfg.debut,
      heure_fin:            heureFin,
      statut:               'planifiee',
      mois,
      annee,
      nb_adresses_total:    countByZone.get(zone1.id) ?? 0,
      nb_adresses_visitees: 0,
      nb_contacts:          0,
    })

    zoneIndex += cfg.deux_zones ? 2 : 1
  }

  if (!toInsert.length)
    return NextResponse.json(
      { error: 'Aucune session à générer — vérifiez la date de début et les jours sélectionnés' },
      { status: 400 }
    )

  const { error: insErr } = await supabase.from('planning_sessions').insert(toInsert)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Re-fetch avec joins pour la réponse
  const { data: sessions } = await supabase
    .from('planning_sessions')
    .select(SESSION_SELECT)
    .eq('commercial_id', user.id).eq('mois', mois).eq('annee', annee)
    .order('date_prevue', { ascending: true })

  const s          = sessions ?? []
  const totalAdres = s.reduce((acc: number, x: any) => acc + (x.nb_adresses_total ?? 0), 0)

  return NextResponse.json({
    planning: s,
    kpis: {
      nbPlanifiees: s.length, nbRealisees: 0, nbAnnulees: 0,
      totalAdresses: totalAdres, visitees: 0, totalContacts: 0, pctRealise: 0,
    },
  })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mois  = parseInt(searchParams.get('mois')  ?? '0')
  const annee = parseInt(searchParams.get('annee') ?? '0')

  await supabase.from('planning_sessions')
    .delete()
    .eq('commercial_id', user.id)
    .eq('mois', mois)
    .eq('annee', annee)
    .eq('statut', 'planifiee')

  return NextResponse.json({ ok: true })
}
