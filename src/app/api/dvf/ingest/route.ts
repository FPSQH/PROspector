// ============================================================
// POST /api/dvf/ingest
//
// Ingestion des mutations DVF pour une commune depuis les CSV
// statiques Etalab : files.data.gouv.fr/geo-dvf/latest/csv/
//
// Body    : { code_insee: string }
// Retourne: { nb_upserted, total_rows, code_commune }
// ============================================================

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchDvfCommune, normalizeDvfRow } from '@/lib/dvf/client'

const CRON_SECRET = process.env.CRON_SECRET ?? '05091974'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: Request) {
  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader !== CRON_SECRET) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const codeInsee: string | undefined = body?.code_insee
  if (!codeInsee) return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })

  // ── Téléchargement + parsing du CSV commune ───────────────────────
  let rows, totalRows
  try {
    ;({ rows, totalRows } = await fetchDvfCommune(codeInsee))
  } catch (err: any) {
    return NextResponse.json({ error: `DVF: ${err.message}` }, { status: 502 })
  }

  if (rows.length === 0) {
    await createAdminClient()
      .from('communes')
      .update({ derniere_verif_dvf: new Date().toISOString(), nb_dvf: 0 })
      .eq('code_insee', codeInsee)
    return NextResponse.json({ nb_upserted: 0, total_rows: 0, code_commune: codeInsee })
  }

  // ── Normalisation ─────────────────────────────────────────────────
  const toUpsert = rows
    .map(normalizeDvfRow)
    .filter(r => r.id_mutation && r.code_commune && r.date_mutation)

  // ── Upsert par batch de 200 ───────────────────────────────────────
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
    if (error) console.error('[DVF ingest] upsert error:', error.message)
    else nbUpserted += count ?? batch.length
  }

  // ── Mise à jour commune ───────────────────────────────────────────
  const { count: total } = await adminDb
    .from('dvf_mutations')
    .select('id', { count: 'exact', head: true })
    .eq('code_commune', codeInsee)

  await adminDb
    .from('communes')
    .update({ derniere_verif_dvf: new Date().toISOString(), nb_dvf: total ?? 0 })
    .eq('code_insee', codeInsee)

  return NextResponse.json({ nb_upserted: nbUpserted, total_rows: totalRows, code_commune: codeInsee })
}
