import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Dashboard DPE : toujours les 30 derniers jours (1 mois glissant)
// Groupé par ville, trié date décroissante, avec type de logement

async function getDpeRecents(supabase: any, commercialId: string) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const { data: communes } = await supabase
    .from('communes')
    .select('code_insee, nom')
    .eq('commercial_id', commercialId)

  if (!communes?.length) return { byCommune: {}, total: 0, since }

  const codeInsees = communes.map((c: any) => c.code_insee)

  // Requête sur dpe_logement (source unifiée) avec adresse rattachée
  const { data: dpes } = await supabase
    .from('dpe_logement')
    .select('adresse_id, date_etablissement, etiquette_dpe, type_batiment, adresse_brute, code_insee')
    .in('code_insee', codeInsees)
    .gte('date_etablissement', since)
    .order('date_etablissement', { ascending: false })
    .limit(500)

  // Enrichir avec les noms de communes
  const communeNomMap = new Map(communes.map((c: any) => [c.code_insee, c.nom]))

  const byCommune: Record<string, any[]> = {}
  for (const dpe of (dpes ?? [])) {
    const ville = communeNomMap.get(dpe.code_insee) ?? dpe.code_insee ?? 'Inconnue'
    if (!byCommune[ville]) byCommune[ville] = []
    byCommune[ville].push({
      adresse:      dpe.adresse_brute ?? '',
      classe:       dpe.etiquette_dpe ?? '?',
      type_bien:    dpe.type_batiment ?? null,
      date:         dpe.date_etablissement,
    })
  }

  // Trier chaque ville par date décroissante (déjà fait par Supabase mais sécurité)
  for (const ville of Object.keys(byCommune)) {
    byCommune[ville].sort((a: any, b: any) => (b.date > a.date ? 1 : -1))
  }

  // Trier les villes par nombre de DPE décroissant
  const sorted: Record<string, any[]> = {}
  Object.entries(byCommune)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([k, v]) => { sorted[k] = v })

  const total = Object.values(sorted).reduce((s, a) => s + a.length, 0)
  return { byCommune: sorted, total, since }
}

export async function GET() {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const supabase = createAdminClient()
  const { byCommune, total, since } = await getDpeRecents(supabase, user.id)
  return NextResponse.json({ dpe: byCommune, total, since })
}
