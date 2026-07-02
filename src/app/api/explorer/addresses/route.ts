import { createClient } from '@/lib/supabase/server'
import { getEffectiveCommercialId } from '@/lib/delegation'
import { NextResponse } from 'next/server'

// GET /api/explorer/addresses
// Filtres : type_bien, zone_id, statut, has_dpe, has_dvf,
//           dpe_classes (ex. "E,F,G"), dpe_recence (mois), has_audit,
//           non_visitee_mois (adresses sans passage terrain depuis N mois)

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()
  const { searchParams } = new URL(req.url)

  const typeBien       = searchParams.get('type_bien')
  const zoneId         = searchParams.get('zone_id')
  const hasDpe         = searchParams.get('has_dpe')
  const hasDvf         = searchParams.get('has_dvf')
  const statut         = searchParams.get('statut')
  const dpeClasses     = (searchParams.get('dpe_classes') ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const dpeRecence     = parseInt(searchParams.get('dpe_recence') ?? '0', 10)
  const hasAudit       = searchParams.get('has_audit') === 'true'
  const nonVisiteeMois = parseInt(searchParams.get('non_visitee_mois') ?? '0', 10)

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', effectiveId)

  if (!communes?.length) return NextResponse.json({ addresses: [] })

  const codesInsee = communes.map((c: any) => c.code_insee)

  // Paginer par batch de 1000 pour récupérer toutes les adresses
  const addresses: any[] = []
  const batches: string[][] = []
  for (let i = 0; i < codesInsee.length; i += 5) batches.push(codesInsee.slice(i, i + 5))

  for (const batchInsee of batches) {
    let from = 0
    while (true) {
      let query = supabase
        .from('adresses')
        .select('id, lat, lon, type_bien, zone_id, dpe_etiquette, latest_dpe_date, statut_prospection')
        .in('code_insee', batchInsee)
        .eq('prospectable', true)
        .range(from, from + 999)

      if (typeBien) query = query.eq('type_bien', typeBien)
      if (zoneId)   query = query.eq('zone_id', zoneId)
      if (statut)   query = query.eq('statut_prospection', statut)
      // has_dpe : latest_dpe_date est maintenue par le matching DPE → filtre SQL direct
      if (hasDpe === 'true')      query = query.not('latest_dpe_date', 'is', null)
      if (dpeClasses.length > 0)  query = query.in('dpe_etiquette', dpeClasses)
      if (dpeRecence > 0) {
        const cutoff = new Date()
        cutoff.setMonth(cutoff.getMonth() - dpeRecence)
        query = query.gte('latest_dpe_date', cutoff.toISOString().slice(0, 10))
      }

      const { data, error } = await query
      if (error || !data || data.length === 0) break
      addresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
  }

  let result = addresses

  // Filtre has_audit : adresses dont un DPE matché porte un audit énergétique
  if (hasAudit && result.length > 0) {
    const auditIds = new Set<string>()
    let from = 0
    while (true) {
      const { data } = await supabase
        .from('dpe_logement')
        .select('adresse_id')
        .in('code_insee', codesInsee)
        .eq('has_audit', true)
        .not('adresse_id', 'is', null)
        .range(from, from + 999)
      const rows = (data ?? []) as any[]
      if (!rows.length) break
      for (const row of rows) auditIds.add(row.adresse_id)
      if (rows.length < 1000) break
      from += 1000
    }
    result = result.filter((a: any) => auditIds.has(a.id))
  }

  // Filtre non_visitee_mois : exclut les adresses avec un passage terrain récent
  if (nonVisiteeMois > 0 && result.length > 0) {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - nonVisiteeMois)
    const visitedIds = new Set<string>()
    let from = 0
    while (true) {
      const { data } = await supabase
        .from('interactions')
        .select('adresse_id')
        .gte('created_at', cutoff.toISOString())
        .range(from, from + 999)
      if (!data?.length) break
      for (const row of data) visitedIds.add((row as any).adresse_id)
      if (data.length < 1000) break
      from += 1000
    }
    result = result.filter((a: any) => !visitedIds.has(a.id))
  }

  // Filtre has_dvf : utilise la RPC pour récupérer les adresses avec transaction à proximité
  if (hasDvf === 'true' && result.length > 0) {
    const dvfIds = new Set<string>()
    const { data } = await (supabase as any)
      .rpc('dvf_density_per_address', { p_codes_insee: codesInsee, p_annees: 5 })
    for (const row of (data ?? [])) dvfIds.add((row as any).adresse_id)
    result = result.filter((a: any) => dvfIds.has(a.id))
  }

  return NextResponse.json({ addresses: result, total: result.length })
}
