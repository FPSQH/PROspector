import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/courriers?dpe=E,F,G&limit=50
// Retourne les adresses avec DPE enrichies pour génération de lettres

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dpeFilter = (searchParams.get('dpe') ?? 'E,F,G').split(',').map(d => d.trim().toUpperCase())
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)

  // Récupérer le commercial
  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom, agence, telephone, email')
    .eq('user_id', user.id)
    .single()
  if (!commercial) return NextResponse.json({ error: 'Commercial non trouvé' }, { status: 404 })

  const adminDb = createAdminClient()

  // Communes du commercial
  const { data: communes } = await adminDb
    .from('communes')
    .select('code_insee')
    .eq('commercial_id', commercial.id)
  const codes = (communes ?? []).map((c: any) => c.code_insee)
  if (!codes.length) return NextResponse.json({ adresses: [], nb: 0 })

  // Adresses avec DPE
  const { data: adresses, error } = await adminDb
    .from('adresses')
    .select('id, adresse_brute, code_postal, code_insee, type_bien, surface_habitable, dpe_etiquette, dpe_ges, latest_dpe_date, dpe_numero, lat, lon')
    .in('dpe_etiquette', dpeFilter)
    .in('code_insee', codes)
    .eq('prospectable', true)
    .not('dpe_etiquette', 'is', null)
    .order('latest_dpe_date', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[COURRIERS] adresses error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const adresseIds = (adresses ?? []).map((a: any) => a.id)
  if (!adresseIds.length) return NextResponse.json({ adresses: [], nb: 0 })

  // Données enrichies DPE
  const { data: dpeData } = await adminDb
    .from('dpe_logement')
    .select('adresse_id, conso_ep_m2, cout_annuel, energie_principale, ges_m2')
    .in('adresse_id', adresseIds)
    .not('adresse_id', 'is', null)
  const dpeMap = new Map((dpeData ?? []).map((d: any) => [d.adresse_id, d]))

  // Audits par adresse
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
      categorie:    a.categorie_scenario,
      classe_apres: a.classe_apres,
      cout_travaux: a.cout_travaux,
      gain_pct:     a.gain_pct,
      etape:        a.etape_travaux,
    })
  }

  // Nom de commune depuis code_insee
  const { data: communesNoms } = await adminDb
    .from('communes')
    .select('code_insee, nom')
    .in('code_insee', codes)
  const communeNomMap = new Map((communesNoms ?? []).map((c: any) => [c.code_insee, c.nom]))

  // Résultat enrichi
  const result = (adresses ?? []).map((a: any) => {
    const dpe = dpeMap.get(a.id) ?? {}
    return {
      ...a,
      nom_commune:        communeNomMap.get(a.code_insee) ?? '',
      conso_ep_m2:        dpe.conso_ep_m2        ?? null,
      cout_annuel:        dpe.cout_annuel         ?? null,
      energie_principale: dpe.energie_principale  ?? null,
      ges_m2:             dpe.ges_m2              ?? null,
      audit:              auditMap.get(a.id)      ?? null,
      agent_nom:          commercial.nom,
      agent_prenom:       commercial.prenom,
      agent_agence:       commercial.agence,
      agent_telephone:    commercial.telephone,
      agent_email:        commercial.email,
    }
  })

  return NextResponse.json({ adresses: result, nb: result.length })
}
