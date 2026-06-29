import { createClient } from '@/lib/supabase/server'
import { getEffectiveCommercialId } from '@/lib/delegation'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()
  const { searchParams } = new URL(req.url)

  const swLat  = parseFloat(searchParams.get('sw_lat') ?? '')
  const swLon  = parseFloat(searchParams.get('sw_lon') ?? '')
  const neLat  = parseFloat(searchParams.get('ne_lat') ?? '')
  const neLon  = parseFloat(searchParams.get('ne_lon') ?? '')
  const typeBien  = searchParams.get('type_bien')
  const zoneId    = searchParams.get('zone_id')
  const hasDpe    = searchParams.get('has_dpe')
  const hasDvf    = searchParams.get('has_dvf')
  const statut    = searchParams.get('statut')

  // Récupérer les communes du commercial
  const { data: communes } = await supabase
    .from('communes')
    .select('code_insee')
    .eq('commercial_id', effectiveId)

  if (!communes?.length) return NextResponse.json({ addresses: [] })

  const codesInsee = communes.map((c: any) => c.code_insee)

  let query = supabase
    .from('adresses')
    .select(`
      id, lat, lon, numero, nom_voie, code_postal, commune, type_bien,
      prospectable, zone_id,
      zones_prospection (id, nom, couleur, numero)
    `)
    .in('code_insee', codesInsee)
    .eq('prospectable', true)
    .limit(10000)

  if (!isNaN(swLat) && !isNaN(swLon) && !isNaN(neLat) && !isNaN(neLon)) {
    query = query
      .gte('lat', swLat).lte('lat', neLat)
      .gte('lon', swLon).lte('lon', neLon)
  }

  if (typeBien)  query = query.eq('type_bien', typeBien)
  if (zoneId)    query = query.eq('zone_id', zoneId)
  if (statut)    query = query.eq('statut_prospection', statut)

  const { data: addresses, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let result = addresses ?? []

  // Filtre has_dpe : join côté client sur dpe_logement
  if (hasDpe === 'true' && result.length > 0) {
    const ids = result.map((a: any) => a.id)
    const batches: string[][] = []
    for (let i = 0; i < ids.length; i += 500) batches.push(ids.slice(i, i + 500))
    const dpeIds = new Set<string>()
    for (const batch of batches) {
      const { data } = await supabase
        .from('dpe_logement').select('adresse_id').in('adresse_id', batch).limit(500)
      for (const row of (data ?? [])) dpeIds.add((row as any).adresse_id)
    }
    result = result.filter((a: any) => dpeIds.has(a.id))
  }

  // Filtre has_dvf : join côté client sur dvf_mutations (via adresse geom)
  if (hasDvf === 'true' && result.length > 0) {
    const ids = result.map((a: any) => a.id)
    const batches: string[][] = []
    for (let i = 0; i < ids.length; i += 500) batches.push(ids.slice(i, i + 500))
    const dvfIds = new Set<string>()
    for (const batch of batches) {
      const { data } = await (supabase as any)
        .rpc('dvf_density_per_address', { p_codes_insee: codesInsee, p_annees: 4 })
      for (const row of (data ?? [])) dvfIds.add((row as any).adresse_id)
    }
    result = result.filter((a: any) => dvfIds.has(a.id))
  }

  return NextResponse.json({ addresses: result })
}
