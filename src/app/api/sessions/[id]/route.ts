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
      nom_tournee, adresse_ids,
      zones_prospection (id, nom, couleur, numero, nb_prospectables)
    `)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session non trouvee' }, { status: 404 })

  const s        = session as any
  const adminDb  = createAdminClient()
  const allAdresses: any[] = []

  const dpeMap: Record<string, {
    date:            string
    etiquette:       string | null
    has_audit:       boolean
    audit_n:         string | null
    audit_date:      string | null
    audit_scenarios: any[] | null
  }> = {}

  // ── Chargement des adresses ──────────────────────────────────────────────────
  if (s.type_session === 'dpe' && s.adresse_ids?.length) {
    // Tournée DPE : charge depuis dpe_logement (adresse_ids = dpe_logement.id[])
    // Inclut TOUS les biens DPE, même ceux non appariés à une adresse de prospection
    const { data: dpes } = await adminDb
      .from('dpe_logement')
      .select('id, adresse_id, adresse_brute, lat, lon, code_insee, type_batiment, etiquette_dpe, date_etablissement, has_audit, audit_n, audit_date, audit_scenarios')
      .in('id', s.adresse_ids)

    for (const d of (dpes ?? [])) {
      if (!d.lat || !d.lon) continue
      // Utiliser adresse_id si disponible (permet les interactions BottomSheet),
      // sinon utiliser dpe.id (bien visible sur la carte + GPS, sans interaction)
      const eid = d.adresse_id ?? d.id
      allAdresses.push({
        id:                     eid,
        lat:                    d.lat,
        lon:                    d.lon,
        numero:                 null,
        nom_voie:               d.adresse_brute ?? '',
        code_postal:            null,
        commune:                null,
        code_insee:             d.code_insee,
        type_bien:              d.type_batiment,
        nb_bal:                 null,
        prospectable:           true,
        type_habitat:           null,
        mode_prospection:       null,
        statut_prospectabilite: null,
        motif_exclusion:        null,
        courrier_cible_possible: false,
        commentaire_adresse:    null,
        nom_syndic:             null,
        nb_acces_observe:       null,
      })
      // DPE déjà chargé — pré-remplir dpeMap directement
      dpeMap[eid] = {
        date:            d.date_etablissement,
        etiquette:       (d.etiquette_dpe ?? '').toUpperCase() || null,
        has_audit:       !!d.has_audit,
        audit_n:         d.audit_n         ?? null,
        audit_date:      d.audit_date      ?? null,
        audit_scenarios: d.audit_scenarios ?? null,
      }
    }
  } else {
    // Session normale : charge depuis adresses (zone ou commune)
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
  }

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

  // Charger DPE uniquement pour les sessions normales (déjà rempli pour type_session='dpe')
  if (s.type_session !== 'dpe') {
    const adresseIds = allAdresses.map((a: any) => a.id)
    if (adresseIds.length > 0) {
      const { data: dpes } = await supabase
        .from('dpe_logement')
        .select('adresse_id, date_etablissement, etiquette_dpe, has_audit, audit_n, audit_date, audit_scenarios')
        .in('adresse_id', adresseIds)
        .not('etiquette_dpe', 'is', null)
        .order('date_etablissement', { ascending: false })
      for (const d of (dpes ?? [])) {
        if (!dpeMap[d.adresse_id]) {
          dpeMap[d.adresse_id] = {
            date:            d.date_etablissement,
            etiquette:       (d.etiquette_dpe ?? '').toUpperCase() || null,
            has_audit:       !!d.has_audit,
            audit_n:         d.audit_n        ?? null,
            audit_date:      d.audit_date     ?? null,
            audit_scenarios: d.audit_scenarios ?? null,
          }
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
      latest_dpe_date:  dpeMap[a.id]?.date            ?? null,
      dpe_etiquette:    dpeMap[a.id]?.etiquette        ?? null,
      has_audit:        dpeMap[a.id]?.has_audit        ?? false,
      audit_n:          dpeMap[a.id]?.audit_n          ?? null,
      audit_date:       dpeMap[a.id]?.audit_date       ?? null,
      audit_scenarios:  dpeMap[a.id]?.audit_scenarios  ?? null,
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
  if (statut === 'en_cours') {
    updates.heure_debut_reel = new Date().toISOString()
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

      const allInts = ints ?? []

      // ── PORTES : 1 interaction = 1 adresse visitée ──────────────
      const nb_portes = allInts.length

      // ── CONTACTS : presence=true OU resultat='contact' ──────────
      // presence=true OU resultat='contact_etabli' (valeur normalisée en base)
      const nb_contacts_interactions = allInts.filter((i: any) =>
        i.presence === true || i.resultat === 'contact_etabli'
      ).length

      // Contacts CRM liés aux adresses visitées (créés depuis /contacts)
      const adresseIdsSession = allInts.map((i: any) => i.adresse_id).filter(Boolean)
      let nb_contacts_crm = 0
      if (adresseIdsSession.length > 0) {
        const { data: crmContacts } = await adminDb
          .from('contacts')
          .select('id')
          .in('adresse_id', adresseIdsSession)
          .eq('commercial_id', user.id)
        nb_contacts_crm = crmContacts?.length ?? 0
      }
      const nb_contacts = Math.max(nb_contacts_interactions, nb_contacts_crm)

      // ── BOITAGE : flyers + courriers + boîtage ──────────────────
      const nb_boitage = allInts.filter((i: any) =>
        i.action === 'flyer_depose' || i.action === 'courrier_depose'
      ).length

      // ── MAISONS qualifiées ───────────────────────────────────────
      const nb_maisons = allInts.filter((i: any) => i.type_habitat === 'individuel').length

      // ── COLLECTIF qualifié ───────────────────────────────────────
      const nb_collectif = allInts.filter((i: any) => i.type_habitat === 'collectif').length

      // ── COMMERCES / ACTIVITÉS recensés ──────────────────────────
      const nb_commerces = allInts.filter((i: any) => i.type_habitat === 'activite').length

      // Syndics
      let nb_syndics = 0
      if (adresseIdsSession.length > 0) {
        const { data: adrsSync } = await adminDb
          .from('adresses').select('id')
          .in('id', adresseIdsSession)
          .not('nom_syndic', 'is', null).neq('nom_syndic', '')
        nb_syndics = adrsSync?.length ?? 0
      }

      const rapport_json = {
        nb_visites:          nb_portes,
        nb_contacts,
        nb_boitage,
        nb_maisons,
        nb_collectif,
        nb_commerces,
        nb_syndics,
        nb_contacts_terrain: nb_contacts_interactions,
        nb_contacts_crm,
        date_cloture:        new Date().toISOString(),
      }

      await supabase
        .from('sessions_prospection')
        .update({ rapport_json, nb_portes: nb_portes })
        .eq('id', params.id)

      await supabase.from('planning_sessions')
        .update({
          statut:                 'realisee',
          nb_adresses_visitees:   nb_portes,
          nb_contacts:            nb_contacts,
          nb_maisons_qualifiees:  nb_maisons,
          nb_immeubles_qualifies: nb_collectif,
          nb_syndics_qualifies:   nb_syndics,
          nb_adresses_supprimees: nb_commerces,
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
