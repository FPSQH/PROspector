import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ══════════════════════════════════════════════════════════════════
// POST /api/adresses/prequalifier
//
// Enrichit adresses.type_bien depuis 3 sources (par ordre de fiabilité) :
//   Passe 0 (BDNB)  : type_batiment_dpe  → source la plus fiable
//   Passe 1 (DPE)   : type_batiment de dpe_logement (fallback)
//
// Ne touche que les adresses avec type_bien IS NULL ou 'inconnu'.
// Les qualifications manuelles existantes sont préservées.
// ══════════════════════════════════════════════════════════════════

// BDNB type_batiment_dpe → adresses.type_bien
const BDNB_TYPE_MAP: Record<string, string> = {
  maison:      'maison',
  appartement: 'appartement',
  tertiaire:   'commerce',   // tertiaire BDNB (bureaux, commerces, services) → commerce
}

// DPE type_batiment → adresses.type_bien + has_commerce
const DPE_TYPE_MAP: Record<string, { type_bien: string; has_commerce: boolean }> = {
  maison:      { type_bien: 'maison',      has_commerce: false },
  appartement: { type_bien: 'appartement', has_commerce: false },
  immeuble:    { type_bien: 'appartement', has_commerce: true  },
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', user.id)
  if (!communes?.length) return NextResponse.json({ nb_qualifiees: 0 })

  const codesInsee = communes.map((c: any) => c.code_insee)

  let nbBdnb = 0
  let nbDpe  = 0

  // ── Passe 0 : enrichissement depuis BDNB (type_batiment_dpe) ──────────────
  // Récupère le type BDNB pour tous les bâtiments des communes
  const { data: bdnbRows } = await supabase
    .from('bdnb_batiment_groupe')
    .select('batiment_groupe_id, type_batiment_dpe')
    .in('code_commune_insee', codesInsee)
    .not('type_batiment_dpe', 'is', null)

  if (bdnbRows?.length) {
    // Grouper les batiment_groupe_id par type mappé
    const byType = new Map<string, string[]>()
    for (const row of bdnbRows) {
      const mappedType = BDNB_TYPE_MAP[row.type_batiment_dpe?.toLowerCase()]
      if (!mappedType) continue
      const list = byType.get(mappedType) ?? []
      list.push(row.batiment_groupe_id)
      byType.set(mappedType, list)
    }

    // Mettre à jour les adresses liées (batiment_groupe_id), non encore qualifiées
    for (const [typeBien, ids] of byType) {
      for (const batch of chunk(ids, 200)) {
        const { data: updated } = await supabase
          .from('adresses')
          .update({ type_bien: typeBien })
          .in('batiment_groupe_id', batch)
          .in('code_insee', codesInsee)
          .or('type_bien.is.null,type_bien.eq.inconnu,type_bien.eq.tertiaire')
          .select('id')
        nbBdnb += updated?.length ?? 0
      }
    }
  }

  // ── Passe 1 : enrichissement depuis DPE interne (fallback) ────────────────
  // Pour les adresses sans batiment_groupe_id ou dont BDNB n'a pas de type
  const { data: dpeRows } = await supabase
    .from('dpe_logement')
    .select('adresse_id, type_batiment')
    .in('code_insee', codesInsee)
    .not('adresse_id', 'is', null)
    .not('type_batiment', 'is', null)

  if (dpeRows?.length) {
    // Grouper par adresse_id : type majoritaire + has_commerce
    const adresseMap = new Map<string, { counts: Record<string, number>; has_commerce: boolean }>()

    for (const dpe of dpeRows) {
      if (!dpe.adresse_id) continue
      const mapped = DPE_TYPE_MAP[dpe.type_batiment?.toLowerCase()] ?? null
      if (!mapped) continue
      const entry = adresseMap.get(dpe.adresse_id) ?? { counts: {}, has_commerce: false }
      entry.counts[mapped.type_bien] = (entry.counts[mapped.type_bien] ?? 0) + 1
      if (mapped.has_commerce) entry.has_commerce = true
      adresseMap.set(dpe.adresse_id, entry)
    }

    // Grouper par (type_bien, has_commerce) pour batcher les updates
    const groups = new Map<string, string[]>()
    for (const [adresseId, entry] of adresseMap) {
      const typeBien = Object.entries(entry.counts).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (!typeBien) continue
      const key = typeBien + '|' + entry.has_commerce
      const list = groups.get(key) ?? []
      list.push(adresseId)
      groups.set(key, list)
    }

    for (const [key, ids] of groups) {
      const [typeBien, hasCommerceStr] = key.split('|')
      const hasCommerce = hasCommerceStr === 'true'

      for (const batch of chunk(ids, 100)) {
        const { data: updated } = await supabase
          .from('adresses')
          .update({ type_bien: typeBien, has_commerce: hasCommerce })
          .in('id', batch)
          .or('type_bien.is.null,type_bien.eq.inconnu')
          .select('id')
        nbDpe += updated?.length ?? 0
      }
    }
  }

  return NextResponse.json({
    nb_qualifiees:        nbBdnb + nbDpe,
    nb_depuis_bdnb:       nbBdnb,
    nb_depuis_dpe:        nbDpe,
    nb_dpe_traites:       dpeRows?.length ?? 0,
    nb_adresses_distinctes: (dpeRows ? new Set(dpeRows.map((d: any) => d.adresse_id)).size : 0),
  })
}
