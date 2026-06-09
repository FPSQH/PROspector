import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/dpe/sync-secteur
// { date_debut: 'YYYY-MM-DD' }
//
// Ingestion à la demande déclenchée depuis la page Courrier DPE.
// Synchronise les DPE du secteur de l'utilisateur depuis date_debut,
// avec pagination complète. Appelé avant chaque recherche pour garantir
// des données à jour sur la plage demandée.

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const dateDebut: string | null = body?.date_debut ?? null

  const adminDb = createAdminClient()

  // ── Commercial et communes du secteur ───────────────────────────
  let { data: commercial } = await adminDb
    .from('commerciaux').select('id').eq('id', user.id).maybeSingle()
  if (!commercial) {
    const { data: asManager } = await adminDb
      .from('commerciaux').select('id').eq('manager_id', user.id).limit(1).maybeSingle()
    commercial = asManager ?? null
  }
  if (!commercial) return NextResponse.json({ error: 'Profil non trouvé' }, { status: 403 })

  const { data: communes } = await adminDb
    .from('communes')
    .select('code_insee, code_postal, nom')
    .eq('commercial_id', commercial.id)

  if (!communes?.length) return NextResponse.json({ nb_communes: 0, nb_inserted: 0 })

  const baseUrl = new URL(req.url).origin
  let totalInserted = 0
  const syncedCommunes: string[] = []

  for (const commune of communes) {
    let after: string | null = null
    let page = 0

    while (true) {
      const r = await fetch(`${baseUrl}/api/dpe/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET ?? '05091974',
        },
        body: JSON.stringify({
          code_postal:  commune.code_postal ?? '',
          code_insee:   commune.code_insee,
          filter_date:  dateDebut,   // null = incrémental depuis derniere_verif_dpe
          after,
        }),
      })

      const d = await r.json()
      if (!r.ok) break

      totalInserted += d.nb_inserted ?? 0
      after = d.after ?? null
      page++
      if (!after || d.has_more === false || page > 100) break
    }

    syncedCommunes.push(commune.nom)
  }

  return NextResponse.json({
    nb_communes: communes.length,
    nb_inserted: totalInserted,
    communes: syncedCommunes,
  })
}
