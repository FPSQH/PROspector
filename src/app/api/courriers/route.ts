import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/courriers?zone_id=...&dpe=F,G&limit=50
// Retourne les adresses avec DPE pour génération de lettres

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const zone_id = searchParams.get('zone_id')
  const dpe_filter = searchParams.get('dpe')?.split(',').map(d => d.trim().toUpperCase()) ?? ['E','F','G']
  const limit = parseInt(searchParams.get('limit') ?? '100')

  // Récupérer le commercial
  const { data: commercial } = await supabase
    .from('commerciaux').select('id, nom, prenom, agence, telephone, email')
    .eq('user_id', user.id).single()
  if (!commercial) return NextResponse.json({ error: 'Commercial non trouvé' }, { status: 404 })

  const adminDb = createAdminClient()

  // Requête adresses avec DPE via admin client
  let query = adminDb
    .from('adresses')
    .select(`id, adresse_brute: numero_voie || ' ' || nom_voie, code_postal, code_insee,
      type_bien, surface_habitable, dpe_etiquette, dpe_ges,
      latest_dpe_date, dpe_numero, lat, lon`)
    .in('dpe_etiquette', dpe_filter)
    .eq('prospectable', true)
    .not('dpe_etiquette', 'is', null)
    .limit(limit)

  // Filtrer par zone si demandé
  if (zone_id) {
    const { data: zoneAdresses } = await adminDb
      .from('adresses').select('id')
      .eq('zone_id', zone_id)
    const ids = (zoneAdresses ?? []).map((a: any) => a.id)
    if (ids.length > 0) query = query.in('id', ids)
  } else {
    // Toutes les communes du commercial
    const { data: communes } = await adminDb
      .from('communes').select('code_insee').eq('commercial_id', commercial.id)
    const codes = (communes ?? []).map((c: any) => c.code_insee)
    if (codes.length > 0) query = query.in('code_insee', codes)
  }

  const { data: adresses, error } = await query.order('latest_dpe_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Récupérer les données enrichies DPE (conso, coût, énergie, ges)
  const adresseIds = (adresses ?? []).map((a: any) => a.id)
  const { data: dpeData } = await adminDb
    .from('dpe_logement')
    .select('adresse_id, conso_ep_m2, cout_annuel, energie_principale, ges_m2')
    .in('adresse_id', adresseIds)
    .not('adresse_id', 'is', null)

  const dpeMap = new Map((dpeData ?? []).map((d: any) => [d.adresse_id, d]))

  // Récupérer les audits
  const { data: auditData } = await adminDb
    .from('audit_logement')
    .select('adresse_id, n_audit, date_audit, categorie_scenario, classe_apres, cout_travaux, gain_pct, etape_travaux')
    .in('adresse_id', adresseIds)
    .order('etape_travaux', { ascending: true })

  // Grouper les audits par adresse_id
  const auditMap = new Map<string, any>()
  for (const a of (auditData ?? [])) {
    if (!auditMap.has(a.adresse_id)) {
      auditMap.set(a.adresse_id, { n_audit: a.n_audit, date_audit: a.date_audit, scenarios: [] })
    }
    auditMap.get(a.adresse_id).scenarios.push({
      categorie:    a.categorie_scenario,
      classe_apres: a.classe_apres,
      cout_travaux: a.cout_travaux,
      gain_pct:     a.gain_pct,
      etape:        a.etape_travaux,
    })
  }

  // Construire la réponse enrichie
  const result = (adresses ?? []).map((a: any) => {
    const dpe = dpeMap.get(a.id) ?? {}
    return {
      ...a,
      conso_ep_m2:        dpe.conso_ep_m2        ?? null,
      cout_annuel:        dpe.cout_annuel        ?? null,
      energie_principale: dpe.energie_principale ?? null,
      ges_m2:             dpe.ges_m2             ?? null,
      audit:              auditMap.get(a.id)     ?? null,
      // Données agent pour la lettre
      agent_nom:          commercial.nom,
      agent_prenom:       commercial.prenom,
      agent_agence:       commercial.agence,
      agent_telephone:    commercial.telephone,
      agent_email:        commercial.email,
    }
  })

  return NextResponse.json({ adresses: result, nb: result.length })
}
