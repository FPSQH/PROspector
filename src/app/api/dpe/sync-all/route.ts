import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/dpe/sync-all?secret=<CRON_SECRET>
//
// Appelé par le cron Vercel quotidiennement.
// Pour chaque commercial, synchronise les DPE de ses communes
// si derniere_verif_dpe > VERIF_INTERVAL_DAYS jours.
// Utilise l'endpoint /api/dpe/ingest en boucle pour gérer la pagination.

const VERIF_INTERVAL_DAYS = 2
const CRON_SECRET = process.env.CRON_SECRET ?? '05091974'

export const maxDuration = 300 // 5 min max (Vercel Pro)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const adminDb = createAdminClient()
  const now = Date.now()
  const maxAge = VERIF_INTERVAL_DAYS * 24 * 3600 * 1000

  // ── Toutes les communes de tous les commerciaux ──────────────────
  const { data: communes, error } = await adminDb
    .from('communes')
    .select('code_insee, code_postal, nom, commercial_id, derniere_verif_dpe')
    .or(`derniere_verif_dpe.is.null,derniere_verif_dpe.lt.${new Date(now - maxAge).toISOString()}`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!communes?.length) return NextResponse.json({ message: 'Aucune commune à synchroniser', nb_communes: 0 })

  const baseUrl = new URL(request.url).origin
  const results: { commune: string; inserted: number; pages: number; error?: string }[] = []

  for (const commune of communes) {
    let totalInserted = 0
    let after: string | null = null
    let page = 0
    let communeError: string | undefined

    try {
      while (true) {
        const r = await fetch(`${baseUrl}/api/dpe/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Transmettre un cookie factice pour bypasser l'auth user — adminDb est utilisé côté ingest
            'x-cron-secret': CRON_SECRET,
          },
          body: JSON.stringify({
            code_postal: commune.code_postal ?? '',
            code_insee: commune.code_insee,
            force_full: !commune.derniere_verif_dpe,
            after,
          }),
        })

        const d = await r.json()
        if (!r.ok) { communeError = d.error ?? `HTTP ${r.status}`; break }

        totalInserted += d.nb_inserted ?? 0
        after = d.after ?? null
        page++
        if (!after || d.has_more === false || page > 100) break
      }
    } catch (e: any) {
      communeError = e.message
    }

    results.push({ commune: `${commune.nom} (${commune.code_insee})`, inserted: totalInserted, pages: page, ...(communeError ? { error: communeError } : {}) })
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0)
  console.log(`[sync-all] ${communes.length} communes, ${totalInserted} DPE insérés/mis à jour`)

  return NextResponse.json({
    nb_communes: communes.length,
    nb_inserted: totalInserted,
    results,
  })
}
