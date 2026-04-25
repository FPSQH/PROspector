import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dpeFilter = (searchParams.get('dpe') ?? 'E,F,G').split(',').map((d: string) => d.trim().toUpperCase())
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom, agence, telephone, email')
    .eq('user_id', user.id)
    .single()
  if (!commercial) return NextResponse.json({ error: 'Commercial non trouve' }, { status: 404 })

  const adminDb = createAdminClient()

  const { data: communes } = await adminDb
    .from('communes').select('code_insee, nom').eq('commercial_id', commercial.id)
  const codes = (communes ?? []).map((c: any) => c.code_insee)
  const communeNomMap = new Map((communes ?? []).map((c: any) => [c.code_insee, c.nom]))
  if (!codes.length) return NextResponse.json({ adresses: [], nb: 0 })

  const { data: adresses, error } = await adminDb
    .from('adresses')
    .select('id, adresse_brute, code_postal, code_insee, type_bien, surface_habitable, dpe_etiquette, dpe_ges, latest_dpe_date, dpe_numero, lat, lon')
    .in('dpe_etiquette', dpeFilter)
    .in('code_insee', codes)
    .eq('prospectable', true)
    .order('latest_dpe_date', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const adresseIds = (adresses ?? []).map((a: any) => a.id)
  if (!adresseIds.length) return NextResponse.json({ adresses: [], nb: 0 })

  const { data: dpeData } = await adminDb
    .from('dpe_logement')
    .select('adresse_id, conso_ep_m2, cout_annuel, energie_principale, ges_m2')
    .in('adresse_id', adresseIds)
  const dpeMap = new Map((dpeData ?? []).map((d: any) => [d.adresse_id, d]))

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
