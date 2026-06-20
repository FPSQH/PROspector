import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/courriers?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD&limit=500
//
// Étape 5 moteur DPE : source unifiée dpe_logement (zéro latence ADEME)
// Filtré par secteur actuel de l'utilisateur + plage de dates.

export async function GET(request: Request) {
  const supabase  = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dateDebut = searchParams.get('date_debut') ?? ''
  const dateFin   = searchParams.get('date_fin')   ?? ''
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '500'), 500)

  const adminDb = createAdminClient()

  // ── Commercial connecté ───────────────────────────────────────────────────
  let { data: commercial } = await adminDb
    .from('commerciaux')
    .select('id, nom, prenom, telephone, email, agent_titre, agence_nom, agence_adresse, agence_telephone, agence_email')
    .eq('id', user.id).maybeSingle()

  if (!commercial) {
    const { data: asManager } = await adminDb
      .from('commerciaux')
      .select('id, nom, prenom, telephone, email, agent_titre, agence_nom, agence_adresse, agence_telephone, agence_email')
      .eq('manager_id', user.id).limit(1).maybeSingle()
    commercial = asManager ?? null
  }
  if (!commercial) return NextResponse.json({ error: 'Profil non trouvé' }, { status: 403 })

  // ── Communes du secteur actuel ────────────────────────────────────────────
  const { data: communes } = await adminDb
    .from('communes')
    .select('code_insee, nom, code_postal')
    .eq('commercial_id', commercial.id)

  if (!communes?.length) {
    return NextResponse.json({
      adresses: [], nb: 0,
      stats: { byLettre: {A:0,B:0,C:0,D:0,E:0,F:0,G:0}, nbAudit:0, nbSansAudit:0, nbHorsZone:0, total:0 }
    })
  }

  const codeInsees    = communes.map((c: any) => c.code_insee)
  const communeNomMap = new Map(communes.map((c: any) => [c.code_insee, c.nom]))

  // ── Zones actives (pour badge "dans une zone") ────────────────────────────
  const { data: zones } = await adminDb
    .from('zones_prospection')
    .select('id, nom')
    .eq('commercial_id', commercial.id)
    .eq('statut', 'active')
  const zoneNomMap = new Map((zones ?? []).map((z: any) => [z.id, z.nom]))

  // ── Requête principale sur dpe_logement avec join adresses pour zone_id ────
  let query = adminDb
    .from('dpe_logement')
    .select('id, numero_dpe, code_insee, adresse_brute, adresse_id, type_batiment, surface_habitable, etiquette_dpe, etiquette_ges, date_etablissement, date_modification, conso_ep_m2, cout_annuel, energie_principale, ges_m2, lat, lon, has_audit, audit_n, audit_date, audit_scenarios, adresses(zone_id)')
    .in('code_insee', codeInsees)
    .order('date_etablissement', { ascending: false })
    .limit(limit)

  if (dateDebut) query = (query as any).gte('date_etablissement', dateDebut)
  // lte sur date_fin + 1 jour pour inclure tous les DPE de la journée dateFin
  if (dateFin) {
    const dateFinExclusive = new Date(dateFin)
    dateFinExclusive.setDate(dateFinExclusive.getDate() + 1)
    query = (query as any).lt('date_etablissement', dateFinExclusive.toISOString().split('T')[0])
  }

  const { data: dpes, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Construire la réponse ─────────────────────────────────────────────────
  const byLettre: Record<string, number> = {A:0,B:0,C:0,D:0,E:0,F:0,G:0}
  let nbAudit = 0, nbSansAudit = 0, nbHorsZone = 0

  const adresses = (dpes ?? []).map((d: any) => {
    const dpe = (d.etiquette_dpe || '').toUpperCase()
    if (byLettre[dpe] !== undefined) byLettre[dpe]++

    const isRed   = ['E','F','G'].includes(dpe)
    const hasAud  = !!d.has_audit && !!d.audit_n
    if (isRed && hasAud) nbAudit++
    else if (isRed)      nbSansAudit++

    // Zone via join adresses
    const zoneId  = (d as any).adresses?.zone_id ?? null
    const zoneNom = zoneId ? (zoneNomMap.get(zoneId) ?? null) : null
    if (!zoneId) nbHorsZone++

    return {
      id:                 d.id,
      adresse_id:         d.adresse_id   ?? null,
      adresse_brute:      d.adresse_brute ?? '',
      code_postal:        '',
      code_insee:         d.code_insee,
      nom_commune:        communeNomMap.get(d.code_insee) ?? '',
      type_bien:          d.type_batiment ?? null,
      surface_habitable:  d.surface_habitable ?? null,
      dpe_etiquette:      dpe || null,
      dpe_ges:            (d.etiquette_ges || '').toUpperCase() || null,
      latest_dpe_date:    d.date_etablissement,
      dpe_numero:         d.numero_dpe,
      conso_ep_m2:        d.conso_ep_m2 ?? null,
      cout_annuel:        d.cout_annuel ?? null,
      energie_principale: d.energie_principale ?? null,
      ges_m2:             d.ges_m2 ?? null,
      lat:                d.lat ?? null,
      lon:                d.lon ?? null,
      zone_id:            zoneId,
      zone_nom:           zoneNom,
      needs_audit:        isRed && !hasAud,
      has_audit:          hasAud,
      audit: hasAud ? {
        n_audit:    d.audit_n,
        date_audit: d.audit_date,
        scenarios:  d.audit_scenarios ?? [],
      } : null,
      // Données agent pour le DOCX
      agent_nom:       commercial?.nom ?? '',
      agent_prenom:    commercial?.prenom ?? '',
      agent_titre:     commercial?.agent_titre ?? 'Conseiller Immobilier',
      agent_agence:          commercial?.agence_nom      ?? '',
      agent_agence_adresse:  commercial?.agence_adresse   ?? '',
      agent_telephone:       commercial?.agence_telephone ?? '',
      agent_email:           commercial?.agence_email     ?? '',
      agent_email_direct:    commercial?.email            ?? '',

      agent_tel_direct:      commercial?.telephone        ?? '',
    }
  })

  return NextResponse.json({
    adresses,
    nb:    adresses.length,
    stats: { byLettre, nbAudit, nbSansAudit, nbHorsZone, total: adresses.length }
  })
}
