// ============================================================
// GET /api/dvf/stats/zone/[id]
//
// Stats DVF filtrées par le polygone d'une zone de prospection.
// Utilise ST_Within via la fonction SQL dvf_stats_zone().
//
// Retourne : { stats: DvfZoneStats | null }
// ============================================================

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export interface DvfZoneStats {
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
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const zoneId = params.id

  // Vérifier que la zone appartient à l'utilisateur
  const { data: zone } = await supabase
    .from('zones_prospection')
    .select('id')
    .eq('id', zoneId)
    .eq('commercial_id', user.id)
    .maybeSingle()

  if (!zone) return NextResponse.json({ error: 'Zone introuvable' }, { status: 404 })

  const adminDb = createAdminClient()
  const { data: rows, error } = await adminDb.rpc('dvf_stats_zone', {
    p_zone_id: zoneId,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const r = rows?.[0] ?? null
  if (!r || Number(r.nb_transactions ?? 0) === 0) {
    return NextResponse.json({ stats: null })
  }

  const stats: DvfZoneStats = {
    nb_transactions:      Number(r.nb_transactions),
    prix_median_m2:       r.prix_median_m2      ? Number(r.prix_median_m2)      : null,
    prix_moyen_m2:        r.prix_moyen_m2       ? Number(r.prix_moyen_m2)       : null,
    prix_median_maison:   r.prix_median_maison  ? Number(r.prix_median_maison)  : null,
    prix_median_appart:   r.prix_median_appart  ? Number(r.prix_median_appart)  : null,
    surface_mediane_bati: r.surface_mediane_bati ? Number(r.surface_mediane_bati) : null,
    nb_maisons:           Number(r.nb_maisons ?? 0),
    nb_appartements:      Number(r.nb_appartements ?? 0),
    annee_min:            r.annee_min ?? null,
    annee_max:            r.annee_max ?? null,
  }

  return NextResponse.json(
    { stats },
    { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
  )
}
