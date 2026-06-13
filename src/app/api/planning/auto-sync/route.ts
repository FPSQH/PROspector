import { getEffectiveCommercialId } from '@/lib/delegation'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(s: string) { return new Date(s + 'T12:00:00') }
function toMois(s: string) { return toDate(s).getMonth() + 1 }
function toAnnee(s: string) { return toDate(s).getFullYear() }

/**
 * Calcule les N prochaines dates valides après `fromDate`
 * selon les jours configurés (union jours1 ∪ jours2).
 */
function computeNextDates(
  fromDate: string,
  n: number,
  jours1: number[],
  jours2: number[],
): string[] {
  if (n <= 0) return []
  const allJours = [...new Set([...jours1, ...jours2])].sort()
  if (allJours.length === 0) {
    // Fallback : +7j par date manquante
    const dates: string[] = []
    const d = toDate(fromDate)
    for (let i = 0; i < n; i++) {
      d.setDate(d.getDate() + 7)
      dates.push(d.toISOString().split('T')[0])
    }
    return dates
  }
  const dates: string[] = []
  const d = toDate(fromDate)
  let safety = 0
  while (dates.length < n && safety < 400) {
    d.setDate(d.getDate() + 1)
    safety++
    if (allJours.includes(d.getDay())) {
      dates.push(d.toISOString().split('T')[0])
    }
  }
  return dates
}

// ── POST /api/planning/auto-sync ──────────────────────────────────────────────
//
// Algorithme :
//   Soit N = sessions "planifiée" avec date_prevue < aujourd'hui   (manquées)
//   Soit M = sessions "planifiée" avec date_prevue >= aujourd'hui  (futures)
//
//   On construit un pool de M+N dates futures :
//     [sub[0].date, ..., sub[M-1].date, extra[0], ..., extra[N-1]]
//
//   • Les N sessions manquées deviennent "non_realisee" (trace historique)
//   • On insère N nouvelles sessions "planifiee" avec les dates du pool[0..N-1]
//     (les zones manquées récupèrent les premières dates libres disponibles)
//   • Les M sessions futures décalent d'un rang : sub[i] → pool[N+i]
//     (elles "poussent" pour faire de la place aux zones manquées)
//
// Impact cross-month : les champs mois/annee sont recalculés depuis la nouvelle
// date, donc le décalage se propage automatiquement sur les mois suivants.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const today = new Date().toISOString().split('T')[0]

  // ── 1. Sessions manquées ──────────────────────────────────────────────────
  const { data: missedRaw } = await supabase
    .from('planning_sessions')
    .select('id, zone_id, date_prevue, heure_debut, heure_fin, nb_adresses_total')
    .eq('commercial_id', effectiveId)
    .eq('statut', 'planifiee')
    .lt('date_prevue', today)
    .order('date_prevue', { ascending: true })
    .order('heure_debut', { ascending: true })

  const missed = missedRaw ?? []
  const N = missed.length

  if (N === 0) {
    return NextResponse.json({ nb_non_realisees: 0, nb_decalees: 0 })
  }

  // ── 2. Sessions futures ───────────────────────────────────────────────────
  const { data: subRaw } = await supabase
    .from('planning_sessions')
    .select('id, date_prevue, mois, annee, heure_debut')
    .eq('commercial_id', effectiveId)
    .eq('statut', 'planifiee')
    .gte('date_prevue', today)
    .order('date_prevue', { ascending: true })
    .order('heure_debut', { ascending: true })

  const sub = subRaw ?? []
  const M = sub.length

  // ── 3. Config jours ───────────────────────────────────────────────────────
  const { data: cfg } = await supabase
    .from('planning_config')
    .select('jours_semaine, jours_semaine_2')
    .eq('commercial_id', effectiveId)
    .maybeSingle()
  const jours1 = (cfg?.jours_semaine   as number[] | null) ?? [2, 3, 5]
  const jours2 = (cfg?.jours_semaine_2 as number[] | null) ?? []

  // ── 4. Pool de dates futures (M sub + N extra) ────────────────────────────
  const lastDate = M > 0 ? sub[M - 1].date_prevue : missed[N - 1].date_prevue
  const extraDates = computeNextDates(lastDate, N, jours1, jours2)
  const pool = [...sub.map(s => s.date_prevue), ...extraDates]
  // pool[i]     → nouvelle date pour missed[i]     (i = 0..N-1)
  // pool[N + i] → nouvelle date pour sub[i]        (i = 0..M-1)

  const now = new Date().toISOString()

  // ── 5. Marquer les sessions manquées en "non_realisee" ───────────────────
  await supabase
    .from('planning_sessions')
    .update({ statut: 'non_realisee', updated_at: now })
    .in('id', missed.map(m => m.id))

  // ── 6. Insérer les sessions reportées (zones manquées, nouvelles dates) ──
  const toInsert = missed.map((m, i) => {
    const d = pool[i]
    return {
      commercial_id:        user.id,
      zone_id:              m.zone_id,
      date_prevue:          d,
      mois:                 toMois(d),
      annee:                toAnnee(d),
      heure_debut:          m.heure_debut,
      heure_fin:            m.heure_fin,
      statut:               'planifiee',
      nb_adresses_total:    m.nb_adresses_total ?? 0,
      nb_adresses_visitees: 0,
      nb_contacts:          0,
    }
  })
  if (toInsert.length > 0) {
    await supabase.from('planning_sessions').insert(toInsert)
  }

  // ── 7. Décaler les sessions futures (chacune prend pool[N + i]) ───────────
  for (let i = 0; i < M; i++) {
    const d = pool[N + i]
    await supabase
      .from('planning_sessions')
      .update({
        date_prevue: d,
        mois:        toMois(d),
        annee:       toAnnee(d),
        updated_at:  now,
      })
      .eq('id', sub[i].id)
  }

  return NextResponse.json({ nb_non_realisees: N, nb_decalees: M })
}
