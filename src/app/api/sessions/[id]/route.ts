import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

const ADRESSE_SELECT = 'id, lat, lon, numero, nom_voie, code_postal, commune, code_insee, type_bien, nb_bal, prospectable, type_habitat, mode_prospection, statut_prospectabilite, motif_exclusion, courrier_cible_possible, commentaire_adresse, nom_syndic, nb_acces_observe'

export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions_prospection')
    .select(`
      id, zone_id, date_session, heure_debut, heure_fin,
      heure_debut_reel, heure_fin_reel, statut,
      nb_portes, nb_boites, notes, rapport_json,
      type_session, commune_code_insee, commune_nom,
      zones_prospection (id, nom, couleur, numero, nb_prospectables)
    `)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session non trouvee' }, { status: 404 })

  const s = session as any
  const allAdresses: any[] = []
  let from = 0

  const buildQuery = () => {
    const base = supabase.from('adresses').select(ADRESSE_SELECT).not('lat', 'is', null)
    if (s.zone_id)            return base.eq('zone_id', s.zone_id)
    if (s.commune_code_insee) return base.eq('code_insee', s.commune_code_insee)
    return null
  }

  const baseQuery = buildQuery()
  if (baseQuery) {
    while (true) {
      const { data, error } = await baseQuery.range(from, from + 999)
      if (error || !data || data.length === 0) break
      allAdresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
  }

  // FIX : utiliser adminDb pour bypasser RLS sur interactions (cohérent avec interactions/route.ts)
  const adminDb = createAdminClient()

  const { data: interactions } = await adminDb
    .from('interactions')
    .select('id, adresse_id, resultat, action, type_contact, type_habitat, statut_adresse, note, date_relance')
    .eq('session_id', params.id)

  let itineraire: any[] = []
  if (s.zone_id) {
    const { data: itin } = await supabase
      .from('itineraires_zone').select('adresse_id, ordre')
      .eq('zone_id', s.zone_id).order('ordre')
    itineraire = itin ?? []
  }

  const interMap = new Map((interactions ?? []).map((i: any) => [i.adresse_id, i]))
  const itinMap  = new Map(itineraire.map((i: any) => [i.adresse_id, i.ordre]))

  const adresseIds = allAdresses.map((a: any) => a.id)
  const dpeMap: Record<string, { date: string; etiquette: string | null }> = {}
  if (adresseIds.length > 0) {
    const { data: dpes } = await supabase
      .from('dpe_logement')
      .select('adresse_id, date_etablissement, etiquette_dpe')
      .in('adresse_id', adresseIds)
      .not('etiquette_dpe', 'is', null)
      .order('date_etablissement', { ascending: false })
    for (const d of (dpes ?? [])) {
      if (!dpeMap[d.adresse_id]) {
        dpeMap[d.adresse_id] = {
          date:      d.date_etablissement,
          etiquette: (d.etiquette_dpe ?? '').toUpperCase() || null,
        }
      }
    }
  }

  const adressesAvecStatut = allAdresses.map((a: any) => {
    const inter  = interMap.get(a.id)
    const statut =
      !inter                                 ? 'a_faire'
      : inter.statut_adresse === 'supprimee' ? 'supprimee'
      : inter.resultat === 'contact_etabli'  ? 'contact'
      : inter.resultat === 'contact'         ? 'contact'
      : inter.action === 'flyer' || inter.action === 'boite' || inter.action === 'courrier' ? 'boite'
      : 'visite'
    return {
      ...a, statut_carte: statut, interaction: inter ?? null,
      ordre: itinMap.get(a.id) ?? 9999, score: 50,
      latest_dpe_date: dpeMap[a.id]?.date      ?? null,
      dpe_etiquette:   dpeMap[a.id]?.etiquette ?? null,
    }
  }).sort((a, b) => a.ordre - b.ordre)

  const nb_visites = adressesAvecStatut.filter(a => a.statut_carte !== 'a_faire').length

  return NextResponse.json({
    session, adresses: adressesAvecStatut,
    nb_total: allAdresses.length, nb_visites,
    pct_couvert: allAdresses.length > 0 ? Math.round(nb_visites / allAdresses.length * 100) : 0,
  })
}

export async function PATCH(req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { statut, heure_fin, nb_portes, nb_boites, notes, date_session, zone_id } = body

  const updates: any = {}
  if (statut)                  updates.statut         = statut
  if (heure_fin)               updates.heure_fin      = heure_fin
  if (heure_fin)               updates.heure_fin_reel = new Date().toISOString()
  if (nb_portes !== undefined) updates.nb_portes      = nb_portes
  if (nb_boites !== undefined) updates.nb_boites      = nb_boites
  if (notes     !== undefined) updates.notes          = notes
  if (date_session)            updates.date_session   = date_session
  if (zone_id)                 updates.zone_id        = zone_id

  if (statut === 'realisee' && !heure_fin) {
    updates.heure_fin_reel = new Date().toISOString()
  }

  const { error: updateError } = await supabase
    .from('sessions_prospection')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (updateError) {
    console.error('[PATCH sessions] update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // ── Clôture : calcul rapport complet ──────────────────────────────────────
  if (statut === 'realisee') {
    try {
      // FIX : adminDb pour bypasser RLS — le client user ne peut pas lire interactions
      const adminDb = createAdminClient()

      const { data: ints } = await adminDb
        .from('interactions')
        .select('adresse_id, type_habitat, statut_adresse, resultat, action, presence, contact_id')
        .eq('session_id', params.id)

      const allInts    = ints ?? []
      const nb_vis     = allInts.length

      // FIX : contacts = presence === true (le BottomSheet n'utilise pas resultat='contact')
      const nb_contacts_int = allInts.filter((i: any) => i.presence === true).length

      const nb_flyers = allInts.filter((i: any) =>
        i.action === 'flyer_depose' || i.action === 'courrier_depose'
      ).length
      const nb_maisons   = allInts.filter((i: any) => i.type_habitat === 'individuel').length
      const nb_immeubles = allInts.filter((i: any) => i.type_habitat === 'collectif').length
      const nb_supprimees = allInts.filter((i: any) => i.statut_adresse === 'supprimee').length
      const nb_qualifs   = allInts.filter((i: any) =>
        i.type_habitat && i.type_habitat !== 'inconnu'
      ).length

      // Syndics
      let nb_syndics = 0
      const adresseIdsWithInt = allInts.map((i: any) => i.adresse_id).filter(Boolean)
      if (adresseIdsWithInt.length > 0) {
        const { data: adrsSync } = await adminDb
          .from('adresses').select('id')
          .in('id', adresseIdsWithInt)
          .not('nom_syndic', 'is', null).neq('nom_syndic', '')
        nb_syndics = adrsSync?.length ?? 0
      }

      // Contacts via fiche créée (contact_id lié à l'interaction)
      const nb_fiches_contact = allInts.filter((i: any) => i.contact_id).length
      const nb_contacts_val   = Math.max(nb_contacts_int, nb_fiches_contact)

      const rapport_json = {
        nb_visites:             nb_vis,
        nb_contacts:            nb_contacts_val,
        nb_fiches_contact,
        nb_flyers,
        nb_maisons,
        nb_immeubles,
        nb_syndics,
        nb_qualifications:      nb_qualifs,
        nb_adresses_supprimees: nb_supprimees,
        date_cloture:           new Date().toISOString(),
      }

      await supabase
        .from('sessions_prospection')
        .update({ rapport_json, nb_portes: nb_vis })
        .eq('id', params.id)

      await supabase.from('planning_sessions')
        .update({
          statut:                 'realisee',
          nb_adresses_visitees:   nb_vis,
          nb_contacts:            nb_contacts_val,
          nb_maisons_qualifiees:  nb_maisons,
          nb_immeubles_qualifies: nb_immeubles,
          nb_syndics_qualifies:   nb_syndics,
          nb_adresses_supprimees: nb_supprimees,
          updated_at:             new Date().toISOString(),
        })
        .eq('session_id', params.id)

    } catch (e) {
      console.warn('[PATCH] Erreur calcul rapport (non bloquant):', e)
    }
  }

  const { data: sessionFinal } = await supabase
    .from('sessions_prospection')
    .select('*, zones_prospection:zone_id(id, nom, couleur, numero, nb_prospectables)')
    .eq('id', params.id)
    .single()

  return NextResponse.json({ session: sessionFinal ?? {} })
}
