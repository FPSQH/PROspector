import { createClient } from '@/lib/supabase/server'
import { getEffectiveCommercialId } from '@/lib/delegation'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()
  const { searchParams } = new URL(req.url)

  const typeBien = searchParams.get('type_bien')
  const zoneId   = searchParams.get('zone_id')
  const hasDpe   = searchParams.get('has_dpe')
  const hasDvf   = searchParams.get('has_dvf')
  const statut   = searchParams.get('statut')

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
        .select('id, lat, lon, type_bien, zone_id')
        .in('code_insee', batchInsee)
        .eq('prospectable', true)
        .range(from, from + 999)

      if (typeBien) query = query.eq('type_bien', typeBien)
      if (zoneId)   query = query.eq('zone_id', zoneId)
      if (statut)   query = query.eq('statut_prospection', statut)

      const { data, error } = await query
      if (error || !data || data.length === 0) break
      addresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
  }

  let result = addresses

  // Filtre has_dpe : récupère les adresse_id qui ont un DPE
  if (hasDpe === 'true' && result.length > 0) {
    const dpeIds = new Set<string>()
    const ids = result.map((a: any) => a.id)
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase
        .from('dpe_logement').select('adresse_id').in('adresse_id', ids.slice(i, i + 500))
      for (const row of (data ?? [])) dpeIds.add((row as any).adresse_id)
    }
    result = result.filter((a: any) => dpeIds.has(a.id))
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
