// ============================================================
// POST /api/dvf/ingest
//
// Ingestion des mutations DVF pour une commune donnée.
// Pagine automatiquement l'API tabulaire data.gouv.fr et
// upsert les résultats dans dvf_mutations.
//
// Body  : { code_insee: string, page?: number }
// Retourne : { nb_upserted, next_page, total_rows, has_more, code_commune }
//
// Appel récursif : si has_more=true, relancer avec page=next_page.
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
  // Auth : session utilisateur OU appel cron interne
  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader !== CRON_SECRET) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const codeInsee: string | undefined = body?.code_insee
  const page: number = body?.page ?? 1

  if (!codeInsee) {
    return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })
  }

  // ── Appel API DVF tabulaire ───────────────────────────────────────
  let rows, nextPage, totalRows
  try {
    ;({ rows, nextPage, totalRows } = await fetchDvfPage(codeInsee, page))
  } catch (err: any) {
    return NextResponse.json({ error: `API DVF: ${err.message}` }, { status: 502 })
  }

  if (rows.length === 0) {
    return NextResponse.json({
      nb_upserted: 0, next_page: null, total_rows: totalRows, has_more: false, code_commune: codeInsee,
    })
  }

  // ── Normalisation + filtrage lignes valides ───────────────────────
  const toUpsert = rows
    .map(normalizeDvfRow)
    .filter(r => r.id_mutation && r.code_commune && r.date_mutation)

  // ── Upsert en base par batch de 200 ──────────────────────────────
  const adminDb = createAdminClient()
  let nbUpserted = 0

  for (const batch of chunk(toUpsert, 200)) {
    const { error, count } = await adminDb
      .from('dvf_mutations')
      .upsert(batch as any[], {
        onConflict: 'id_mutation,type_local,id_parcelle',
        ignoreDuplicates: false,
        count: 'exact',
      })

    if (error) {
      console.error('[DVF] upsert error:', error.message)
    } else {
      nbUpserted += count ?? batch.length
    }
  }

  // ── Mise à jour commune si dernière page ──────────────────────────
  if (nextPage === null) {
    const { count: total } = await adminDb
      .from('dvf_mutations')
      .select('id', { count: 'exact', head: true })
      .eq('code_commune', codeInsee)

    await adminDb
      .from('communes')
      .update({
        derniere_verif_dvf: new Date().toISOString(),
        nb_dvf: total ?? 0,
      })
      .eq('code_insee', codeInsee)
  }

  return NextResponse.json({
    nb_upserted: nbUpserted,
    next_page: nextPage,
    total_rows: totalRows,
    has_more: nextPage !== null,
    code_commune: codeInsee,
  })
}
