import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Trouve la prochaine date valide après `fromDate` selon les jours de la config
function nextValidDate(fromDate: string, jours1: number[], jours2: number[]): string {
  const allJours = [...new Set([...jours1, ...jours2])].sort()
  const d = new Date(fromDate + 'T12:00:00')
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1)
    if (allJours.includes(d.getDay())) return d.toISOString().split('T')[0]
  }
  const fallback = new Date(fromDate + 'T12:00:00')
  fallback.setDate(fallback.getDate() + 7)
  return fallback.toISOString().split('T')[0]
}

// POST /api/planning/reporter
// Body: { session_id } — session annulée à reporter
// Algorithme : la session annulée récupère la date de la prochaine planifiée,
//              chaque session suivante décale d'un slot, la dernière obtient une nouvelle date
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { session_id } = await req.json().catch(() => ({}))
  if (!session_id) return NextResponse.json({ error: 'session_id requis' }, { status: 400 })

  // Vérifier la session annulée
  const { data: sessionAnnulee } = await supabase
    .from('planning_sessions')
    .select('id, date_prevue, zone_id, heure_debut, statut')
    .eq('id', session_id)
    .eq('commercial_id', user.id)
    .single()

  if (!sessionAnnulee)
    return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
  if (sessionAnnulee.statut !== 'annulee')
    return NextResponse.json({ error: 'La session doit être annulée pour être reportée' }, { status: 400 })

  // Récupérer toutes les sessions planifiées APRÈS la date annulée
  const { data: suivantes } = await supabase
    .from('planning_sessions')
    .select('id, date_prevue, heure_debut, mois, annee')
    .eq('commercial_id', user.id)
    .eq('statut', 'planifiee')
    .gt('date_prevue', sessionAnnulee.date_prevue)
    .order('date_prevue', { ascending: true })
    .order('heure_debut', { ascending: true })

  // Config pour calculer la nouvelle dernière date
  const { data: cfg } = await supabase
    .from('planning_config')
    .select('jours_semaine, jours_semaine_2')
    .eq('commercial_id', user.id)
    .maybeSingle()
  const jours1 = cfg?.jours_semaine   ?? [2, 3, 5]
  const jours2 = cfg?.jours_semaine_2 ?? []

  // Cas : aucune session planifiée après → reporter à la prochaine date valide
  if (!suivantes || suivantes.length === 0) {
    const newDate    = nextValidDate(sessionAnnulee.date_prevue, jours1, jours2)
    const newDateObj = new Date(newDate + 'T12:00:00')
    await supabase.from('planning_sessions').update({
      statut:      'planifiee',
      date_prevue: newDate,
      mois:        newDateObj.getMonth() + 1,
      annee:       newDateObj.getFullYear(),
      updated_at:  new Date().toISOString(),
    }).eq('id', session_id)
    return NextResponse.json({ ok: true, nb_decalees: 0 })
  }

  // Algorithme de décalage :
  // - session annulée → date de suivantes[0]
  // - suivantes[i]   → date de suivantes[i+1]
  // - dernière       → prochaine date valide après sa date originale
  const updates: { id: string; date_prevue: string; mois: number; annee: number; statut?: string }[] = []

  const toDate = (s: string) => new Date(s + 'T12:00:00')

  // Session annulée → reprend la date de la première suivante
  const d0 = suivantes[0].date_prevue
  updates.push({
    id: session_id, date_prevue: d0,
    mois: toDate(d0).getMonth() + 1, annee: toDate(d0).getFullYear(),
    statut: 'planifiee',
  })

  // Chaque session intermédiaire prend la date de la suivante
  for (let i = 0; i < suivantes.length - 1; i++) {
    const nd = suivantes[i + 1].date_prevue
    updates.push({
      id: suivantes[i].id, date_prevue: nd,
      mois: toDate(nd).getMonth() + 1, annee: toDate(nd).getFullYear(),
    })
  }

  // Dernière session → prochaine date valide
  const lastOrig = suivantes[suivantes.length - 1].date_prevue
  const newLast  = nextValidDate(lastOrig, jours1, jours2)
  updates.push({
    id: suivantes[suivantes.length - 1].id, date_prevue: newLast,
    mois: toDate(newLast).getMonth() + 1, annee: toDate(newLast).getFullYear(),
  })

  // Appliquer tous les décalages
  for (const u of updates) {
    const patch: any = { date_prevue: u.date_prevue, mois: u.mois, annee: u.annee, updated_at: new Date().toISOString() }
    if (u.statut) patch.statut = u.statut
    await supabase.from('planning_sessions').update(patch).eq('id', u.id)
  }

  return NextResponse.json({ ok: true, nb_decalees: suivantes.length })
}
