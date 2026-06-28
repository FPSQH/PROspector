// ============================================================
// GET /api/dvf/stats/secteur
//
// Stats DVF agrégées pour toutes les communes du secteur
// de l'utilisateur connecté.
//
// Retourne : { stats: { [code_commune]: DvfCommuneStats }, communes_sans_dvf: string[] }
// ============================================================

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export interface DvfCommuneStats {
  code_commune: string
  nb_transactions: number
  prix_median_m2: number | null
  prix_moyen_m2: number | null
  prix_median_maison: number | null
  prix_median_appart: number | null
  surface_mediane_bati: number | null
  nb_maisons: number
  nb_appartements: number
  annee_min: number | null
  annee_max: number | null
  derniere_verif_dvf: string | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Communes du secteur utilisateur
  const { data: communes, error: commErr } = await supabase
    .from('communes')
    .select('code_insee, nom, derniere_verif_dvf')
    .eq('commercial_id', user.id)

  if (commErr || !communes?.length) {
    return NextResponse.json({ stats: {}, communes_sans_dvf: [] })
  }

  type CommuneRow = { code_insee: string; nom: string; derniere_verif_dvf: string | null }
  const codesInsee = (communes as CommuneRow[]).map(c => c.code_insee)

  // Stats via la fonction SQL (lecture publique, pas besoin d'adminClient)
  const adminDb = createAdminClient()
  const { data: rows, error } = await adminDb.rpc('dvf_stats_communes', {
    p_codes_insee: codesInsee,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Compter maisons/appartements séparément
  const { data: countRows } = await adminDb
    .from('dvf_mutations')
    .select('code_commune, type_local')
    .in('code_commune', codesInsee)
    .in('type_local', ['Maison', 'Appartement'])
    .eq('nature_mutation', 'Vente')

  const countMap: Record<string, { maisons: number; apparts: number }> = {}
  for (const r of (countRows ?? [])) {
    if (!countMap[r.code_commune]) countMap[r.code_commune] = { maisons: 0, apparts: 0 }
    if (r.type_local === 'Maison') countMap[r.code_commune].maisons++
    else if (r.type_local === 'Appartement') countMap[r.code_commune].apparts++
  }

  // Indexer par code_commune + enrichir avec métadonnées communes
  const dernVerifMap: Record<string, string | null> = {}
  for (const c of communes) dernVerifMap[c.code_insee] = c.derniere_verif_dvf ?? null

  const stats: Record<string, DvfCommuneStats> = {}
  for (const r of (rows ?? [])) {
    const counts = countMap[r.code_commune] ?? { maisons: 0, apparts: 0 }
    stats[r.code_commune] = {
      code_commune:         r.code_commune,
      nb_transactions:      Number(r.nb_transactions ?? 0),
      prix_median_m2:       r.prix_median_m2 ? Number(r.prix_median_m2) : null,
      prix_moyen_m2:        r.prix_moyen_m2  ? Number(r.prix_moyen_m2)  : null,
      prix_median_maison:   r.prix_median_maison  ? Number(r.prix_median_maison)  : null,
      prix_median_appart:   r.prix_median_appart  ? Number(r.prix_median_appart)  : null,
      surface_mediane_bati: r.surface_mediane_bati ? Number(r.surface_mediane_bati) : null,
      nb_maisons:           counts.maisons,
      nb_appartements:      counts.apparts,
      annee_min:            r.annee_min ?? null,
      annee_max:            r.annee_max ?? null,
      derniere_verif_dvf:   dernVerifMap[r.code_commune] ?? null,
    }
  }

  // Communes sans données DVF en base
  const communesSansDvf = codesInsee.filter(c => !stats[c])

  return NextResponse.json(
    { stats, communes_sans_dvf: communesSansDvf },
    { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
  )
}
