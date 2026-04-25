import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'

// Ingestion des audits énergétiques ADEME pour les DPE E/F/G d'une commune
// Body : { code_insee }
// Retourne : { nb_inserted, nb_dpe_efg, nb_audits_found }

const AUDIT_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/audit-opendata/lines'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await request.json()
  const { code_insee } = body
  if (!code_insee) return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })

  // 1. DPE E/F/G matchés de la commune
  const adminDb0 = createAdminClient()
  const { data: dpeList } = await adminDb0
    .from('dpe_logement')
    .select('numero_dpe, etiquette_dpe, adresse_id')
    .eq('code_insee', code_insee)
    .in('etiquette_dpe', ['E', 'F', 'G'])
    .not('adresse_id', 'is', null)

  if (!dpeList || dpeList.length === 0) {
    return NextResponse.json({ nb_inserted: 0, nb_dpe_efg: 0, nb_audits_found: 0 })
  }

  const numeroDpeList = dpeList.map((d: any) => d.numero_dpe).filter(Boolean)
  const adresseMap    = new Map(dpeList.map((d: any) => [d.numero_dpe, d.adresse_id]))

  let nbInserted   = 0
  let nbAuditsFound = 0

  // 2. Batch de 20 numero_dpe max (limite URL ADEME)
  const AUDIT_FIELDS = [
    'n_audit', 'numero_dpe', 'date_etablissement_audit', 'date_fin_validite_audit',
    'categorie_scenario', 'classe_bilan_dpe', 'etape_travaux',
    'couts_cumules_travaux', 'gains_relatifs_cumules_conso_5_usages_m2_ep',
    'gains_cumules_facture_min', 'gains_cumules_facture_max',
  ].join(',')

  for (const batch of chunk(numeroDpeList, 20)) {
    const qs  = batch.map((n: string) => '"' + n + '"').join(' OR ')
    const url = `${AUDIT_BASE}?size=500&select=${AUDIT_FIELDS}&qs=${encodeURIComponent(qs)}`

    try {
      const resp = await fetch(url)
      if (!resp.ok) { console.error('[AUDIT] HTTP', resp.status); continue }
      const data = await resp.json()

      const rows = (data.results || []).filter((r: any) =>
        batch.includes(r.numero_dpe) && r.n_audit
      )
      if (!rows.length) continue
      nbAuditsFound += rows.length

      const auditBatch = rows.map((r: any) => ({
        n_audit:            r.n_audit,
        numero_dpe:         r.numero_dpe,
        adresse_id:         adresseMap.get(r.numero_dpe) ?? null,
        date_audit:         r.date_etablissement_audit   ?? null,
        date_fin_validite:  r.date_fin_validite_audit    ?? null,
        categorie_scenario: r.categorie_scenario         ?? null,
        classe_apres:       r.classe_bilan_dpe           ?? null,
        cout_travaux:       r.couts_cumules_travaux             != null ? Number(r.couts_cumules_travaux)             : null,
        gain_pct:           r.gains_relatifs_cumules_conso_5_usages_m2_ep != null
                              ? Math.round(Number(r.gains_relatifs_cumules_conso_5_usages_m2_ep) * 100) : null,
        gain_facture_min:   r.gains_cumules_facture_min  != null ? Number(r.gains_cumules_facture_min)  : null,
        gain_facture_max:   r.gains_cumules_facture_max  != null ? Number(r.gains_cumules_facture_max)  : null,
        etape_travaux:      r.etape_travaux               != null ? Number(r.etape_travaux)               : null,
      }))

      const adminDb = createAdminClient()
      const { error } = await adminDb
        .from('audit_logement')
        .upsert(auditBatch, { onConflict: 'n_audit', ignoreDuplicates: false })

      if (error) console.error('[AUDIT] upsert:', error.message)
      else nbInserted += auditBatch.length

    } catch(e) { console.error('[AUDIT] batch error:', e) }
  }

  console.log(`[AUDIT] ${code_insee} — ${numeroDpeList.length} DPE E/F/G, ${nbAuditsFound} audits trouvés, ${nbInserted} insérés`)
  return NextResponse.json({ nb_inserted: nbInserted, nb_dpe_efg: numeroDpeList.length, nb_audits_found: nbAuditsFound })
}
