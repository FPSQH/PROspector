import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const supabase = createAdminClient()

  // Récupérer derniere_connexion du commercial
  let { data: commercial } = await supabase
    .from('commerciaux').select('id, derniere_connexion').eq('id', user.id).maybeSingle()
  if (!commercial) {
    const { data: asManager } = await supabase
      .from('commerciaux').select('id, derniere_connexion').eq('manager_id', user.id).limit(1).maybeSingle()
    commercial = asManager ?? null
  }

  const commercialId = commercial?.id ?? user.id
  // Date de référence pour le badge "new" — dernière connexion ou 7 jours par défaut
  const derniereConnexion = commercial?.derniere_connexion
    ? new Date(commercial.derniere_connexion)
    : new Date(Date.now() - 7 * 24 * 3600 * 1000)

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const { data: communes } = await supabase
    .from('communes').select('code_insee, nom').eq('commercial_id', commercialId)
  if (!communes?.length) return NextResponse.json({ dpe: {}, total: 0, since })

  const codeInsees = communes.map((c: any) => c.code_insee)
  const communeNomMap = new Map(communes.map((c: any) => [c.code_insee, c.nom]))

  const { data: dpes } = await supabase
    .from('dpe_logement')
    .select('adresse_id, date_etablissement, date_modification, etiquette_dpe, type_batiment, adresse_brute, code_insee, updated_at')
    .in('code_insee', codeInsees)
    .gte('date_etablissement', since)
    .order('date_etablissement', { ascending: false })
    .limit(500)

  const byCommune: Record<string, any[]> = {}
  for (const dpe of (dpes ?? [])) {
    const ville = communeNomMap.get(dpe.code_insee) ?? dpe.code_insee ?? 'Inconnue'
    if (!byCommune[ville]) byCommune[ville] = []

    // is_new : DPE mis à jour/ajouté après la dernière connexion
    const dpeUpdated = dpe.updated_at ? new Date(dpe.updated_at) : new Date(dpe.date_etablissement)
    const isNew = dpeUpdated > derniereConnexion

    byCommune[ville].push({
      adresse:   dpe.adresse_brute ?? '',
      classe:    dpe.etiquette_dpe ?? '?',
      type_bien: dpe.type_batiment ?? null,
      date:      dpe.date_etablissement,
      is_new:    isNew,
    })
  }

  // Trier par date décroissante + remonter les "new" en tête
  for (const ville of Object.keys(byCommune)) {
    byCommune[ville].sort((a: any, b: any) => {
      if (a.is_new !== b.is_new) return a.is_new ? -1 : 1
      return b.date > a.date ? 1 : -1
    })
  }

  const sorted: Record<string, any[]> = {}
  Object.entries(byCommune)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([k, v]) => { sorted[k] = v })

  const total = Object.values(sorted).reduce((s, a) => s + a.length, 0)
  const nbNew = Object.values(sorted).flat().filter((d: any) => d.is_new).length

  return NextResponse.json({ dpe: sorted, total, since, nb_new: nbNew })
}
