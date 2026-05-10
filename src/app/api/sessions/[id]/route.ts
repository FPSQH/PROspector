import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// GET /api/sessions/[id] — détail session + adresses avec statut
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions_prospection')
    .select(`
      id, zone_id, date_session, heure_debut, heure_fin,
      heure_debut_reel, heure_fin_reel, statut, created_at,
      nb_portes, nb_boites, nb_contacts_saisis, nb_qualifications, notes, rapport_json,
      zones_prospection (id, nom, couleur, numero, nb_prospectables)
    `)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session non trouvee' }, { status: 404 })

  const allAdresses: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('adresses')
      .select('id, lat, lon, numero, nom_voie, code_postal, commune, type_bien, nb_bal, prospectable, type_habitat, mode_prospection, statut_prospectabilite, motif_exclusion, courrier_cible_possible, commentaire_adresse, nom_syndic, nb_acces_observe')
      .eq('zone_id', session.zone_id)
      .not('lat', 'is', null)
      .range(from, from + 999)
    if (error || !data || data.length === 0) break
    allAdresses.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  const { data: interactions } = await supabase
    .from('interactions')
    .select('id, adresse_id, resultat, action, type_contact, type_habitat, note, date_relance')
    .eq('session_id', params.id)

  const { data: itineraire } = await supabase
    .from('itineraires_zone')
    .select('adresse_id, ordre')
    .eq('zone_id', session.zone_id)
    .order('ordre')

  const interMap = new Map((interactions ?? []).map((i: any) => [i.adresse_id, i]))
  const itinMap  = new Map((itineraire ?? []).map((i: any) => [i.adresse_id, i.ordre]))

  const adresseIds = allAdresses.map((a: any) => a.id)
  type DpeInfo = { date_etablissement: string; etiquette_dpe: string | null; has_audit: boolean; audit_n: string | null }
  const dpeMap: Record<string, DpeInfo> = {}
  if (adresseIds.length > 0) {
    const { data: dpes } = await supabase
      .from('dpe_logement')
      .select('adresse_id, date_etablissement, etiquette_dpe, has_audit, audit_n')
      .in('adresse_id', adresseIds)
      .order('date_etablissement', { ascending: false })
    for (const d of (dpes ?? [])) {
      if (!dpeMap[d.adresse_id]) dpeMap[d.adresse_id] = {
        date_etablissement: d.date_etablissement,
        etiquette_dpe: d.etiquette_dpe ?? null,
        has_audit: d.has_audit ?? false,
        audit_n: d.audit_n ?? null,
      }
    }
  }

  const projetSet = new Set<string>()
  if (adresseIds.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts').select('adresse_id, projets_immobiliers(statut)')
      .in('adresse_id', adresseIds).eq('commercial_id', user.id)
    for (const c of (contacts ?? [])) {
      const projets = (c as any).projets_immobiliers ?? []
      if (projets.some((p: any) => p.statut === 'actif')) projetSet.add(c.adresse_id)
    }
  }

  const visiteMap: Record<string, string> = {}
  if (adresseIds.length > 0) {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    const { data: recentVisites } = await supabase
      .from('interactions').select('adresse_id, created_at')
      .in('adresse_id', adresseIds).gte('created_at', oneMonthAgo)
      .order('created_at', { ascending: false })
    for (const v of (recentVisites ?? [])) {
      if (!visiteMap[v.adresse_id]) visiteMap[v.adresse_id] = v.created_at
    }
  }

  const calcScore = (a: any): number => {
    if (a.statut_prospectabilite === 'non_prospectable' || a.mode_prospection === 'exclure') return 0
    let score = 0
    const dpeInfo = dpeMap[a.id]
    const dpeDate = dpeInfo ? new Date(dpeInfo.date_etablissement) : null
    const now = new Date()
    if (dpeDate) {
      const days = (now.getTime() - dpeDate.getTime()) / (1000 * 60 * 60 * 24)
      if (days <= 30) score += 100
      else if (days <= 90) score += 40
      else if (days <= 180) score += 20
      else if (days <= 365) score += 5
    }
    if (a.type_habitat === 'individuel' || a.type_bien === 'maison') score += 25
    if (a.type_habitat === 'activite' || a.type_bien === 'commerce') score -= 10
    if (a.mode_prospection === 'porte_a_porte') score += 5
    if (projetSet.has(a.id)) score += 15
    if (!visiteMap[a.id]) score += 25
    return Math.min(100, Math.max(0, score))
  }

  const adressesAvecStatut = allAdresses.map((a) => {
    const inter   = interMap.get(a.id)
    const dpeInfo = dpeMap[a.id] ?? null
    const statut  = !inter ? 'a_faire'
      : inter.resultat === 'contact_etabli' ? 'contact'
      : inter.action === 'flyer' || inter.action === 'courrier' ? 'boite'
      : 'visite'
    return {
      ...a,
      statut_carte:    statut,
      interaction:     inter ?? null,
      ordre:           itinMap.get(a.id) ?? 9999,
      score:           calcScore(a),
      latest_dpe_date: dpeInfo?.date_etablissement ?? null,
      etiquette_dpe:   dpeInfo?.etiquette_dpe ?? null,
      has_audit:       dpeInfo?.has_audit ?? false,
      audit_n:         dpeInfo?.audit_n ?? null,
    }
  }).sort((a, b) => a.ordre - b.ordre)

  const nb_visites = adressesAvecStatut.filter((a) => a.statut_carte !== 'a_faire').length

  return NextResponse.json({
    session,
    adresses:    adressesAvecStatut,
    nb_total:    allAdresses.length,
    nb_visites,
    pct_couvert: allAdresses.length > 0
      ? Math.round((nb_visites / allAdresses.length) * 100)
      : 0,
  })
}

// PATCH /api/sessions/[id]
export async function PATCH(req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { statut, heure_fin, nb_portes, nb_boites, notes, date_session, zone_id } = body

  const updates: any = {}
  if (zone_id)      updates.zone_id      = zone_id
  if (notes !== undefined) updates.notes = notes
  if (date_session) updates.date_session = date_session

  // ── Clôture avec calcul automatique des stats ──────────────────
  if (statut === 'realisee') {
    updates.statut        = 'realisee'
    updates.heure_fin_reel = new Date().toISOString()

    // Récupérer toutes les interactions de cette session
    const { data: inters } = await supabase
      .from('interactions')
      .select('resultat, action, type_habitat_observe, adresse_id')
      .eq('session_id', params.id)

    const allInters      = inters ?? []
    const nb_visites     = allInters.length
    const nb_contacts    = allInters.filter((i: any) => i.resultat === 'contact').length
    const nb_flyers      = allInters.filter((i: any) => i.action === 'flyer').length
    const nb_maisons     = allInters.filter((i: any) => i.type_habitat_observe === 'individuel').length
    const nb_immeubles   = allInters.filter((i: any) => i.type_habitat_observe === 'collectif').length
    const nb_qualifs     = nb_maisons + nb_immeubles

    // Récupérer la session pour connaître l'heure de début (pour les contacts)
    const { data: sess } = await supabase
      .from('sessions_prospection').select('created_at, heure_debut_reel').eq('id', params.id).single()
    const sessionStart = sess?.heure_debut_reel ?? sess?.created_at ?? new Date(Date.now() - 7200000).toISOString()

    // Contacts créés pendant la session
    const { data: contactsCrees } = await supabase
      .from('contacts')
      .select('id, nom, prenom, tel1, adresse_id, statut_pipeline')
      .eq('commercial_id', user.id)
      .gte('created_at', sessionStart)

    const rapport: any = {
      nb_visites,
      nb_contacts,
      nb_flyers,
      nb_maisons,
      nb_immeubles,
      nb_qualifications: nb_qualifs,
      contacts: contactsCrees ?? [],
      date_cloture: new Date().toISOString(),
    }

    updates.nb_portes          = nb_portes ?? nb_visites
    updates.nb_boites          = nb_flyers
    updates.nb_contacts_saisis = nb_contacts
    updates.nb_qualifications  = nb_qualifs
    updates.rapport_json       = rapport

    // Sync planning_sessions lié à cette session
    await supabase.from('planning_sessions')
      .update({
        nb_adresses_visitees:   nb_visites,
        nb_contacts:            nb_contacts,
        nb_maisons_qualifiees:  nb_maisons,
        nb_immeubles_qualifies: nb_immeubles,
        statut:                 'realisee',
      })
      .eq('session_id', params.id)
      .eq('commercial_id', user.id)

  } else if (statut) {
    updates.statut = statut
    if (statut === 'realisee' && !heure_fin) updates.heure_fin_reel = new Date().toISOString()
    if (nb_portes !== undefined) updates.nb_portes = nb_portes
    if (nb_boites !== undefined) updates.nb_boites = nb_boites
  }

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 })

  const { data, error } = await supabase
    .from('sessions_prospection')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select(`
      id, statut, nb_portes, nb_boites, nb_contacts_saisis, nb_qualifications,
      rapport_json, heure_fin_reel,
      zones_prospection (nom, couleur, numero)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ session: data, rapport: data?.rapport_json ?? null })
}
