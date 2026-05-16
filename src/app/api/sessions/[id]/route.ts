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
      heure_debut_reel, heure_fin_reel, statut,
      nb_portes, nb_boites, notes,
      zones_prospection (id, nom, couleur, numero, nb_prospectables)
    `)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session non trouvee' }, { status: 404 })

  // Charger les adresses de la zone avec pagination
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

  // Interactions de cette session
  const { data: interactions } = await supabase
    .from('interactions')
    .select('id, adresse_id, resultat, action, type_contact, type_habitat, statut_adresse, note, date_relance')
    .eq('session_id', params.id)

  // Itinéraire
  const { data: itineraire } = await supabase
    .from('itineraires_zone')
    .select('adresse_id, ordre')
    .eq('zone_id', session.zone_id)
    .order('ordre')

  const interMap = new Map((interactions ?? []).map((i: any) => [i.adresse_id, i]))
  const itinMap  = new Map((itineraire  ?? []).map((i: any) => [i.adresse_id, i.ordre]))

  // DPE les plus récents par adresse
  const adresseIds = allAdresses.map((a: any) => a.id)
  const dpeMap: Record<string, string> = {}
  if (adresseIds.length > 0) {
    const { data: dpes } = await supabase
      .from('dpe_logement')
      .select('adresse_id, date_etablissement')
      .in('adresse_id', adresseIds)
      .order('date_etablissement', { ascending: false })
    for (const d of (dpes ?? [])) {
      if (!dpeMap[d.adresse_id]) dpeMap[d.adresse_id] = d.date_etablissement
    }
  }

  function calcScore(a: any): number {
    let s = 50
    if (a.type_bien === 'maison') s += 10
    return Math.min(100, Math.max(0, s))
  }

  const adressesAvecStatut = allAdresses.map((a: any) => {
    const inter = interMap.get(a.id)
    // ✅ 'supprimee' ajouté au statut_carte
    const statut: 'a_faire' | 'contact' | 'boite' | 'visite' | 'supprimee' =
      !inter                             ? 'a_faire'
      : inter.statut_adresse === 'supprimee'    ? 'supprimee'
      : inter.resultat === 'contact_etabli'     ? 'contact'
      : inter.action === 'flyer' || inter.action === 'courrier' ? 'boite'
      : 'visite'
    return {
      ...a,
      statut_carte:    statut,
      interaction:     inter ?? null,
      ordre:           itinMap.get(a.id) ?? 9999,
      score:           calcScore(a),
      latest_dpe_date: dpeMap[a.id] ?? null,
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
  if (statut)                    updates.statut        = statut
  if (heure_fin)                 updates.heure_fin     = heure_fin
  if (heure_fin)                 updates.heure_fin_reel = heure_fin
  if (nb_portes !== undefined)   updates.nb_portes     = nb_portes
  if (nb_boites !== undefined)   updates.nb_boites     = nb_boites
  if (notes     !== undefined)   updates.notes         = notes
  if (date_session)              updates.date_session  = date_session
  if (zone_id)                   updates.zone_id       = zone_id

  if (statut === 'realisee' && !heure_fin) {
    updates.heure_fin_reel = new Date().toTimeString().slice(0, 5)
  }

  const { data, error } = await supabase
    .from('sessions_prospection')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Clôture : calculer et persister les stats qualifications ────────────
  if (statut === 'realisee') {
    try {
      const { data: ints } = await supabase
        .from('interactions')
        .select('type_habitat, type_habitat_observe, statut_adresse, adresses!adresse_id(nom_syndic)')
        .eq('session_id', params.id)

      const allInts = ints ?? []

      const nb_maisons_qualifiees  = allInts.filter((i: any) =>
        i.type_habitat === 'individuel' || i.type_habitat_observe === 'individuel'
      ).length

      const nb_immeubles_qualifies = allInts.filter((i: any) =>
        i.type_habitat === 'collectif' || i.type_habitat_observe === 'collectif'
      ).length

      const nb_syndics_qualifies   = allInts.filter((i: any) =>
        (i as any).adresses?.nom_syndic?.trim?.()
      ).length

      const nb_adresses_supprimees = allInts.filter((i: any) =>
        i.statut_adresse === 'supprimee'
      ).length

      await supabase.from('planning_sessions')
        .update({
          statut:                 'realisee',
          nb_maisons_qualifiees,
          nb_immeubles_qualifies,
          nb_syndics_qualifies,
          nb_adresses_supprimees,
          updated_at:             new Date().toISOString(),
        })
        .eq('session_id', params.id)
    } catch (e) {
      console.warn('[sessions] Erreur calcul stats clôture:', e)
    }
  }

  return NextResponse.json({ session: data })
}
