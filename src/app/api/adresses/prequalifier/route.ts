import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Mapping type_batiment DPE -> type_bien + has_commerce
// maison        -> type_bien=maison,      has_commerce=false
// appartement   -> type_bien=appartement, has_commerce=false
// immeuble      -> type_bien=appartement, has_commerce=true  (peut contenir commerces)
const DPE_TYPE_MAP: Record<string, { type_bien: string; has_commerce: boolean }> = {
  maison:      { type_bien: 'maison',      has_commerce: false },
  appartement: { type_bien: 'appartement', has_commerce: false },
  immeuble:    { type_bien: 'appartement', has_commerce: true  },
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', user.id)
  if (!communes?.length) return NextResponse.json({ nb_qualifiees: 0 })

  const codesInsee = communes.map((c: any) => c.code_insee)

  // Charger tous les DPE matches avec type_batiment
  const { data: dpeRows } = await supabase
    .from('dpe_logement')
    .select('adresse_id, type_batiment')
    .in('code_insee', codesInsee)
    .not('adresse_id', 'is', null)
    .not('type_batiment', 'is', null)

  if (!dpeRows?.length) return NextResponse.json({ nb_qualifiees: 0 })

  // Grouper par adresse_id : prendre le type_bien majoritaire
  // et has_commerce = true si au moins un DPE est immeuble
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

  // Preparer les updates groupes par (type_bien, has_commerce)
  // On ne qualifie QUE les adresses a 'inconnu' pour preserver les qualifications manuelles
  let nbQualifiees = 0

  // Grouper les ids par combinaison (type_bien, has_commerce)
  const groups = new Map<string, string[]>()
  for (const [adresseId, entry] of adresseMap) {
    const typeBien = Object.entries(entry.counts).sort((a,b) => b[1]-a[1])[0]?.[0]
    if (!typeBien) continue
    const key = typeBien + '|' + entry.has_commerce
    const list = groups.get(key) ?? []
    list.push(adresseId)
    groups.set(key, list)
  }

  // Appliquer les updates par groupe (batch de 100)
  for (const [key, ids] of groups) {
    const [typeBien, hasCommerceStr] = key.split('|')
    const hasCommerce = hasCommerceStr === 'true'

    // Batch par 100
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const { count } = await supabase
        .from('adresses')
        .update({ type_bien: typeBien, has_commerce: hasCommerce })
        .in('id', batch)
        .eq('type_bien', 'inconnu')  // ne pas ecraser les qualifications manuelles
        .not('type_bien', 'is', null)

      // Egalement les adresses sans type_bien (null)
      await supabase
        .from('adresses')
        .update({ type_bien: typeBien, has_commerce: hasCommerce })
        .in('id', batch)
        .is('type_bien', null)

      nbQualifiees += count ?? 0
    }
  }

  return NextResponse.json({
    nb_qualifiees: nbQualifiees,
    nb_dpe_traites: dpeRows.length,
    nb_adresses_distinctes: adresseMap.size,
  })
}
