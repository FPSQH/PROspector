import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/dpe/sync-all?secret=<CRON_SECRET>[&force=1]
//
// Appelé par le cron Vercel quotidiennement (vercel.json).
// Synchronise les DPE de toutes les communes dont derniere_verif_dpe
// est plus ancienne que VERIF_INTERVAL_HOURS, les plus anciennes
// d'abord. force=1 ignore ce seuil et resynchronise toutes les
// communes (rattrapage manuel). S'arrête proprement avant le timeout
// Vercel : les communes restantes sont reprises au passage suivant.
// Utilise l'endpoint /api/dpe/ingest en boucle pour gérer la pagination.

// 20h (< cadence quotidienne du cron, tolérant à son jitter) : chaque
// commune est resynchronisée tous les jours, sans doublonner une sync
// déclenchée le même jour depuis l'app.
const VERIF_INTERVAL_HOURS = 20
const CRON_SECRET = process.env.CRON_SECRET ?? '05091974'

export const maxDuration = 300 // 5 min max (Vercel Pro)
const TIME_BUDGET_MS = 270_000 // marge avant maxDuration pour finir proprement

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const adminDb = createAdminClient()
  const now = Date.now()
  const maxAge = VERIF_INTERVAL_HOURS * 3600 * 1000
  const force = searchParams.get('force') === '1'

  // ── Toutes les communes de tous les commerciaux ──────────────────
  // Les plus anciennes vérifications d'abord (null = jamais vérifiée, en tête)
  // pour qu'aucune commune ne soit indéfiniment sacrifiée si le budget temps
  // est atteint avant la fin de la liste.
  let query = adminDb
    .from('communes')
    .select('code_insee, code_postal, nom, commercial_id, derniere_verif_dpe')
  if (!force) {
    query = query.or(`derniere_verif_dpe.is.null,derniere_verif_dpe.lt.${new Date(now - maxAge).toISOString()}`)
  }
  const { data: allCommunes, error } = await query
    .order('derniere_verif_dpe', { ascending: true, nullsFirst: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dédupliquer par code_insee : une même commune peut appartenir à
  // plusieurs commerciaux, une seule ingestion suffit.
  const seen = new Set<string>()
  const communes = (allCommunes ?? []).filter((c: any) => {
    if (seen.has(c.code_insee)) return false
    seen.add(c.code_insee)
    return true
  })

  if (!communes.length) return NextResponse.json({ message: 'Aucune commune à synchroniser', nb_communes: 0 })

  const baseUrl = new URL(request.url).origin
  const results: { commune: string; inserted: number; pages: number; error?: string }[] = []
  let nbSkippedBudget = 0

  for (const commune of communes) {
    if (Date.now() - now > TIME_BUDGET_MS) {
      nbSkippedBudget++
      continue
    }
    let totalInserted = 0
    let after: string | null = null
    let page = 0
    let communeError: string | undefined

    try {
      while (true) {
        // Budget temps atteint en cours de pagination : on s'arrête sans
        // mettre à jour derniere_verif_dpe (fait par ingest sur la dernière
        // page uniquement) — la commune sera reprise au prochain passage.
        if (Date.now() - now > TIME_BUDGET_MS) { communeError = 'budget temps atteint'; break }

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
  console.log(`[sync-all] ${results.length}/${communes.length} communes traitées, ${totalInserted} DPE insérés/mis à jour${nbSkippedBudget ? `, ${nbSkippedBudget} reportées (budget temps)` : ''}`)

  return NextResponse.json({
    nb_communes: results.length,
    nb_communes_reportees: nbSkippedBudget,
    nb_inserted: totalInserted,
    results,
  })
}
