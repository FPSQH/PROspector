import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: communes } = await supabase
    .from('communes')
    .select('code_insee')
    .eq('commercial_id', user.id)

  if (!communes?.length) return NextResponse.json({ adresses: [] })

  const codesInsee = communes.map((c: any) => c.code_insee)

  // Charger toutes les adresses avec pagination
  const adresses: any[] = []
  const batchSize = 5
  for (let i = 0; i < codesInsee.length; i += batchSize) {
    const batch = codesInsee.slice(i, i + batchSize)
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('id, lat, lon, type_bien, prospectable, zone_id, batiment_groupe_id')
        .in('code_insee', batch)
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      adresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
  }

  if (!adresses.length) return NextResponse.json({ adresses: [] })

  const adresseIds = adresses.map((a: any) => a.id)

  // ── Classe DPE depuis BDNB ───────────────────────────────────────────────
  // Utilise classe_bilan_dpe en priorité, puis dérive la classe majoritaire
  // à partir des compteurs nb_classe_bilan_dpe_a/b/.../g si le champ principal est null.
  const batimentIds = Array.from(new Set<string>(
    adresses.filter((a: any) => a.batiment_groupe_id).map((a: any) => a.batiment_groupe_id as string)
  ))

  function deriveDpeClass(b: any): string | null {
    if (b.classe_bilan_dpe) return b.classe_bilan_dpe
    let best: string | null = null; let bestN = 0
    for (const c of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const n = (b[`nb_classe_bilan_dpe_${c}`] ?? 0) as number
      if (n > bestN) { bestN = n; best = c.toUpperCase() }
    }
    return bestN > 0 ? best : null
  }

  const bdnbMap = new Map<string, string>()
  if (batimentIds.length) {
    for (const batch of chunk(batimentIds, 500)) {
      const { data } = await supabase
        .from('bdnb_batiment_groupe')
        .select('batiment_groupe_id, classe_bilan_dpe, nb_classe_bilan_dpe_a, nb_classe_bilan_dpe_b, nb_classe_bilan_dpe_c, nb_classe_bilan_dpe_d, nb_classe_bilan_dpe_e, nb_classe_bilan_dpe_f, nb_classe_bilan_dpe_g')
        .in('batiment_groupe_id', batch)
      for (const b of (data ?? []) as any[]) {
        const classe = deriveDpeClass(b)
        if (classe) bdnbMap.set(b.batiment_groupe_id, classe)
      }
    }
  }

  // ── Statut de prospection (dernière interaction par adresse) ─────────────
  const statutMap = new Map<string, string>()
  for (const batch of chunk(adresseIds, 500)) {
    const { data } = await supabase
      .from('interactions')
      .select('adresse_id, statut_adresse, created_at')
      .in('adresse_id', batch)
      .order('created_at', { ascending: false })
    for (const row of (data ?? []) as any[]) {
      if (!statutMap.has(row.adresse_id) && row.statut_adresse) {
        statutMap.set(row.adresse_id, row.statut_adresse)
      }
    }
  }

  // ── Enrichissement ───────────────────────────────────────────────────────
  const enriched = adresses.map((a: any) => ({
    id: a.id,
    lat: a.lat,
    lon: a.lon,
    type_bien: a.type_bien ?? 'inconnu',
    prospectable: a.prospectable,
    zone_id: a.zone_id,
    classe_bilan_dpe: a.batiment_groupe_id ? (bdnbMap.get(a.batiment_groupe_id) ?? null) : null,
    statut_prospection: statutMap.get(a.id) ?? 'jamais_vue',
  }))

  return NextResponse.json({ adresses: enriched })
}
