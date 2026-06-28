// ============================================================
// POST /api/dvf/sync-secteur
//
// Lance l'ingestion DVF pour toutes les communes du secteur
// de l'utilisateur connecté (première page uniquement).
// Les pages suivantes sont à relancer via /api/dvf/ingest.
//
// Pour un ingestion complète en arrière-plan, appeler
// successivement /api/dvf/ingest avec page=next_page jusqu'à
// has_more=false, puis /api/dvf/enrichir-adresses par commune.
//
// Retourne : { résultats par commune, communes_en_erreur }
// ============================================================

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchDvfPage, normalizeDvfRow } from '@/lib/dvf/client'

const CRON_SECRET = process.env.CRON_SECRET ?? '05091974'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: Request) {
  const cronHeader = req.headers.get('x-cron-secret')
  let userId: string | null = null

  if (cronHeader !== CRON_SECRET) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    userId = user.id
  }

  const body = await req.json().catch(() => ({}))
  // Pour un appel cron : passer commercial_id explicitement
  const targetUserId: string | null = body?.commercial_id ?? userId

  if (!targetUserId) {
    return NextResponse.json({ error: 'commercial_id requis pour appel cron' }, { status: 400 })
  }

  const adminDb = createAdminClient()

  // Communes du secteur
  const { data: communes, error: commErr } = await adminDb
    .from('communes')
    .select('code_insee, nom')
    .eq('commercial_id', targetUserId)

  if (commErr || !communes?.length) {
    return NextResponse.json({ resultats: {}, communes_en_erreur: [] })
  }

  const resultats: Record<string, {
    nb_upserted: number
    total_rows: number | null
    has_more: boolean
    next_page: number | null
  }> = {}
  const communesEnErreur: string[] = []

  // Ingestion séquentielle pour ne pas surcharger l'API DVF
  // (max 20 communes → séquentiel acceptable)
  for (const commune of communes) {
    try {
      const { rows, nextPage, totalRows } = await fetchDvfPage(commune.code_insee, 1)

      const toUpsert = rows
        .map(normalizeDvfRow)
        .filter(r => r.id_mutation && r.code_commune && r.date_mutation)

      let nbUpserted = 0
      for (const batch of chunk(toUpsert, 200)) {
        const { error, count } = await adminDb
          .from('dvf_mutations')
          .upsert(batch as any[], {
            onConflict: 'id_mutation,type_local,id_parcelle',
            ignoreDuplicates: false,
            count: 'exact',
          })
        if (!error) nbUpserted += count ?? batch.length
      }

      // Mise à jour commune si ingestion complète en une page
      if (nextPage === null) {
        const { count: total } = await adminDb
          .from('dvf_mutations')
          .select('id', { count: 'exact', head: true })
          .eq('code_commune', commune.code_insee)

        await adminDb
          .from('communes')
          .update({ derniere_verif_dvf: new Date().toISOString(), nb_dvf: total ?? 0 })
          .eq('code_insee', commune.code_insee)
      }

      resultats[commune.code_insee] = {
        nb_upserted: nbUpserted,
        total_rows: totalRows,
        has_more: nextPage !== null,
        next_page: nextPage,
      }
    } catch (err: any) {
      console.error(`[DVF sync] commune ${commune.code_insee}:`, err.message)
      communesEnErreur.push(commune.code_insee)
    }
  }

  return NextResponse.json({ resultats, communes_en_erreur: communesEnErreur })
}
