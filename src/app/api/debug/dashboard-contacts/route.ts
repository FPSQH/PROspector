// src/app/api/debug/dashboard-contacts/route.ts
// Route temporaire de diagnostic — à supprimer après résolution
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const adminDb  = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const url          = new URL(req.url)
  const month_start  = url.searchParams.get('month_start') ?? ''
  const month_end    = url.searchParams.get('month_end')   ?? ''

  // 1. Sessions réalisées ce mois (client user)
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions_prospection')
    .select('id, date_session, statut, commercial_id')
    .eq('commercial_id', user.id)
    .eq('statut', 'realisee')
    .gte('date_session', month_start)
    .lte('date_session', month_end)

  const session_ids = (sessions ?? []).map(s => s.id)

  // 2. Interactions via adminDb
  let interactions: any[] = []
  let interErr: any = null
  if (session_ids.length > 0) {
    const { data, error } = await adminDb
      .from('interactions')
      .select('id, session_id, resultat, action, created_at')
      .in('session_id', session_ids)
    interactions = data ?? []
    interErr = error
  }

  // 3. Compter par valeur de resultat
  const resultats_counts: Record<string, number> = {}
  for (const i of interactions) {
    const k = i.resultat ?? 'NULL'
    resultats_counts[k] = (resultats_counts[k] ?? 0) + 1
  }

  // 4. Compter contacts (valeurs attendues par le dashboard)
  const nb_contacts = interactions.filter(i =>
    i.resultat === 'contact' || i.resultat === 'contact_etabli'
  ).length

  // 5. Tenter aussi avec client user (pour comparer)
  let interactions_user: any[] = []
  if (session_ids.length > 0) {
    const { data } = await supabase
      .from('interactions')
      .select('id, resultat')
      .in('session_id', session_ids)
    interactions_user = data ?? []
  }

  return NextResponse.json({
    user_id:        user.id,
    month_start,
    month_end,

    // Sessions
    nb_sessions:    (sessions ?? []).length,
    session_ids,
    sessions_raw:   sessions ?? [],
    sess_error:     sessErr,

    // Interactions via adminDb
    nb_interactions:      interactions.length,
    resultats_counts,
    nb_contacts,
    interactions_sample:  interactions.slice(0, 5),
    inter_error:          interErr,

    // Interactions via client user (pour comparer)
    nb_interactions_user: interactions_user.length,
    // Si nb_interactions > 0 mais nb_interactions_user = 0 → RLS bloque le client user
    rls_blocking: interactions.length > 0 && interactions_user.length === 0,
  })
}
