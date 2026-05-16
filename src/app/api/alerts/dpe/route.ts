import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const supabase = createAdminClient()

  // Récupérer le commercial
  let { data: commercial } = await supabase
    .from('commerciaux').select('id, derniere_connexion').eq('id', user.id).maybeSingle()
  if (!commercial) {
    const { data: asManager } = await supabase
      .from('commerciaux').select('id, derniere_connexion').eq('manager_id', user.id).limit(1).maybeSingle()
    commercial = asManager ?? null
  }

  const commercialId = commercial?.id ?? user.id

  // ✅ CORRECTION : NEW = chargé aujourd'hui (début du jour courant), pas depuis dernière connexion
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const { data: communes } = await supabase
    .from('communes').select('code_insee, nom').eq('commercial_id', commercialId)
  if (!communes?.length) return NextResponse.json({ dpe: {}, total: 0, nb_new: 0, since })

  const codeInsees    = communes.map((c: any) => c.code_insee)
  const communeNomMap = new Map(communes.map((c: any) => [c.code_insee, c.nom]))

  const { data: dpes } = await supabase
    .from('dpe_logement')
    .select('adresse_id, date_etablissement, etiquette_dpe, type_batiment, adresse_brute, code_insee, updated_at')
    .in('code_insee', codeInsees)
    .gte('date_etablissement', since)
    .order('date_etablissement', { ascending: false })
    .limit(500)

  const byCommune: Record<string, any[]> = {}
  let nbNew = 0

  for (const dpe of (dpes ?? [])) {
    const ville = communeNomMap.get(dpe.code_insee) ?? dpe.code_insee ?? 'Inconnue'
    if (!byCommune[ville]) byCommune[ville] = []

    // ✅ is_new = updated_at >= début du jour courant (chargé aujourd'hui)
    const dpeUpdated = dpe.updated_at ? new Date(dpe.updated_at) : null
    const isNew      = dpeUpdated ? dpeUpdated >= todayStart : false
    if (isNew) nbNew++

    byCommune[ville].push({
      adresse:   dpe.adresse_brute ?? '',
      classe:    dpe.etiquette_dpe ?? '?',
      type_bien: dpe.type_batiment ?? null,
      date:      dpe.date_etablissement,
      is_new:    isNew,
    })
  }

  // Trier : NEW en tête, puis par date décroissante
  for (const ville of Object.keys(byCommune)) {
    byCommune[ville].sort((a: any, b: any) => {
      if (a.is_new !== b.is_new) return a.is_new ? -1 : 1
      return b.date > a.date ? 1 : -1
    })
  }

  const total = (dpes ?? []).length

  return NextResponse.json({ dpe: byCommune, total, nb_new: nbNew, since })
}
