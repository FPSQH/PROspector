import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/courriers?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD&zone_id=...&limit=200
// Retourne tous les DPE du secteur entre 2 dates avec données enrichies

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dateDebut = searchParams.get('date_debut')
  const dateFin   = searchParams.get('date_fin')
  const zone_id   = searchParams.get('zone_id') ?? null
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500)

  const adminDb = createAdminClient()

  // Récupérer le commercial — par user_id direct
  // ou par manager_id si c'est un manager (manager_id stocké dans commerciaux)
  let { data: commercial } = await adminDb
    .from('commerciaux')
    .select('id, nom, prenom, agence_nom, agence_adresse, agence_telephone, agence_email, agence_logo_url')
    .eq('id', user.id)
    .maybeSingle()

  // Fallback : l'utilisateur est peut-être un manager_id référencé dans commerciaux
  // Dans ce cas, prendre le premier commercial rattaché à ce manager
  if (!commercial) {
    const { data: asManager } = await adminDb
      .from('commerciaux')
      .select('id, nom, prenom, agence_nom, agence_adresse, agence_telephone, agence_email, agence_logo_url')
      .eq('manager_id', user.id)
      .limit(1)
      .maybeSingle()
    commercial = asManager ?? null
  }

  if (!commercial) return NextResponse.json({ error: 'Commercial non trouve — vérifiez votre profil dans Paramètres' }, { status: 403 })

  // Communes du commercial
  const { data: communes } = await adminDb
    .from('communes').select('code_insee, nom').eq('commercial_id', commercial.id)
  const codes = (communes ?? []).map((c: any) => c.code_insee)
  const communeNomMap = new Map((communes ?? []).map((c: any) => [c.code_insee, c.nom]))
  if (!codes.length) return NextResponse.json({ adresses: [], nb: 0, stats: {} })

  // Zones du commercial pour savoir si une adresse est dans une zone
  const { data: zones } = await adminDb
    .from('zones_prospection')
    .select('id, nom, couleur')
    .eq('commercial_id', commercial.id)
    .eq('statut', 'active')
  const zoneIds = (zones ?? []).map((z: any) => z.id)

  // Adresses avec DPE dans la plage de dates
  let query = adminDb
    .from('adresses')
    .select('id, numero, nom_voie, code_postal, code_insee, commune, type_bien, surface_habitable, dpe_etiquette, dpe_ges, latest_dpe_date, dpe_numero, lat, lon, zone_id')
    .in('code_insee', codes)
    .not('dpe_etiquette', 'is', null)
    .order('latest_dpe_date', { ascending: false })
    .limit(limit)

  if (dateDebut) query = query.gte('latest_dpe_date', dateDebut)
  if (dateFin)   query = query.lte('latest_dpe_date', dateFin + 'T23:59:59')
  if (zone_id)   query = query.eq('zone_id', zone_id)

  const { data: adresses, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!adresses?.length) return NextResponse.json({ adresses: [], nb: 0, stats: buildStats([]) })

  const adresseIds = adresses.map((a: any) => a.id)

  // Données enrichies DPE (conso, coût, énergie, GES)
  const { data: dpeData } = await adminDb
    .from('dpe_logement')
    .select('adresse_id, conso_ep_m2, cout_annuel, energie_principale, ges_m2')
    .in('adresse_id', adresseIds)
  const dpeMap = new Map((dpeData ?? []).map((d: any) => [d.adresse_id, d]))

  // Audits
  const { data: auditData } = await adminDb
    .from('audit_logement')
    .select('adresse_id, n_audit, date_audit, categorie_scenario, classe_apres, cout_travaux, gain_pct, etape_travaux')
    .in('adresse_id', adresseIds)
    .order('etape_travaux', { ascending: true })
  const auditMap = new Map<string, any>()
  for (const a of (auditData ?? [])) {
    if (!auditMap.has(a.adresse_id)) {
      auditMap.set(a.adresse_id, { n_audit: a.n_audit, date_audit: a.date_audit, scenarios: [] })
    }
    auditMap.get(a.adresse_id).scenarios.push({
      categorie: a.categorie_scenario, classe_apres: a.classe_apres,
      cout_travaux: a.cout_travaux, gain_pct: a.gain_pct, etape: a.etape_travaux,
    })
  }

  // Contacts existants (pour badge "déjà contacté")
  const { data: contacts } = await adminDb
    .from('contacts')
    .select('adresse_id, created_at, statut')
    .eq('commercial_id', commercial.id)
    .in('adresse_id', adresseIds)
  const contactMap = new Map((contacts ?? []).map((c: any) => [c.adresse_id, c]))

  // Zones map pour nom/couleur
  const zoneMap = new Map((zones ?? []).map((z: any) => [z.id, z]))

  // Construction résultat enrichi
  const result = adresses.map((a: any) => {
    const dpe     = dpeMap.get(a.id) ?? {}
    const audit   = auditMap.get(a.id) ?? null
    const contact = contactMap.get(a.id) ?? null
    const zone    = a.zone_id ? zoneMap.get(a.zone_id) ?? null : null
    const dpeEtiq = (a.dpe_etiquette ?? '').toUpperCase()
    const hasAudit = !!audit?.n_audit
    const needsAudit = ['E','F','G'].includes(dpeEtiq) && !hasAudit

    // Badge "déjà contacté" : comparer date contact vs date DPE
    let dejaContacte = null
    if (contact && a.latest_dpe_date) {
      const contactDate = new Date(contact.created_at)
      const dpeDate     = new Date(a.latest_dpe_date)
      dejaContacte = {
        statut: contact.statut,
        date: contact.created_at,
        avant_dpe: contactDate < dpeDate, // true = contact avant le DPE (ancien)
      }
    }

    const adresse_brute = [a.numero, a.nom_voie].filter(Boolean).join(' ')
    return {
      ...a,
      adresse_brute,
      nom_commune:        a.commune ?? communeNomMap.get(a.code_insee) ?? '',
      conso_ep_m2:        dpe.conso_ep_m2        ?? null,
      cout_annuel:        dpe.cout_annuel         ?? null,
      energie_principale: dpe.energie_principale  ?? null,
      ges_m2:             dpe.ges_m2              ?? null,
      audit,
      has_audit:          hasAudit,
      needs_audit:        needsAudit,
      zone_nom:           zone?.nom   ?? null,
      zone_couleur:       zone?.couleur ?? null,
      hors_zone:          !a.zone_id,
      deja_contacte:      dejaContacte,
      agent_nom:          commercial.nom,
      agent_prenom:       commercial.prenom,
      agent_agence:       commercial.agence_nom,
      agent_adresse:      commercial.agence_adresse,
      agent_telephone:    commercial.agence_telephone,
      agent_email:        commercial.agence_email,
    }
  })

  return NextResponse.json({ adresses: result, nb: result.length, stats: buildStats(result) })
}

function buildStats(adresses: any[]) {
  const byLettre: Record<string, number> = { A:0, B:0, C:0, D:0, E:0, F:0, G:0 }
  let nbAudit = 0, nbSansAudit = 0, nbHorsZone = 0
  for (const a of adresses) {
    const l = (a.dpe_etiquette ?? '').toUpperCase()
    if (byLettre[l] !== undefined) byLettre[l]++
    if (a.has_audit) nbAudit++
    if (['E','F','G'].includes(l) && !a.has_audit) nbSansAudit++
    if (a.hors_zone) nbHorsZone++
  }
  return { byLettre, nbAudit, nbSansAudit, nbHorsZone, total: adresses.length }
}
