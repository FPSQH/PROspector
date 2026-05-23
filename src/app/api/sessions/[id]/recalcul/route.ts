// src/app/api/sessions/[id]/recalcul/route.ts
// POST /api/sessions/:id/recalcul
// Recalcule le rapport_json d'une session réalisée
// en utilisant presence=true pour les contacts (fix bug)

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

export async function POST(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const adminDb  = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Vérifier que la session appartient au commercial et est réalisée
  const { data: session } = await supabase
    .from('sessions_prospection')
    .select('id, commercial_id, statut, rapport_json, zone_id, date_session')
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 })
  }
  if (session.statut !== 'realisee') {
    return NextResponse.json({ error: 'Session non réalisée — recalcul inutile' }, { status: 400 })
  }

  // Lire toutes les interactions via adminDb (bypass RLS)
  const { data: ints, error: intErr } = await adminDb
    .from('interactions')
    .select('adresse_id, type_habitat, statut_adresse, resultat, action, presence, contact_id')
    .eq('session_id', params.id)

  if (intErr) {
    return NextResponse.json({ error: intErr.message }, { status: 500 })
  }

  const allInts = ints ?? []

  // ── Calculs corrigés (presence=true pour contacts) ──────────
  const nb_visites    = allInts.length
  const nb_contacts_presence  = allInts.filter(i => (i as any).presence === true).length
  const nb_fiches     = allInts.filter(i => (i as any).contact_id != null).length
  const nb_contacts   = Math.max(nb_contacts_presence, nb_fiches)
  const nb_flyers     = allInts.filter(i =>
    (i as any).action === 'flyer_depose' || (i as any).action === 'courrier_depose'
  ).length
  const nb_maisons    = allInts.filter(i => (i as any).type_habitat === 'individuel').length
  const nb_immeubles  = allInts.filter(i => (i as any).type_habitat === 'collectif').length
  const nb_supprimees = allInts.filter(i => (i as any).statut_adresse === 'supprimee').length
  const nb_qualifs    = allInts.filter(i =>
    (i as any).type_habitat && (i as any).type_habitat !== 'inconnu'
  ).length

  // Syndics (adresses avec nom_syndic)
  let nb_syndics = 0
  const adresseIds = allInts.map(i => (i as any).adresse_id).filter(Boolean)
  if (adresseIds.length > 0) {
    const { data: syndics } = await adminDb
      .from('adresses').select('id')
      .in('id', adresseIds)
      .not('nom_syndic', 'is', null).neq('nom_syndic', '')
    nb_syndics = syndics?.length ?? 0
  }

  // Conserver les données existantes du rapport (date_cloture, etc.)
  const ancien = (session.rapport_json ?? {}) as Record<string, any>

  const rapport_json = {
    ...ancien,              // conserver les champs non recalculés
    nb_visites,
    nb_contacts,
    nb_fiches_contact: nb_fiches,
    nb_flyers,
    nb_maisons,
    nb_immeubles,
    nb_syndics,
    nb_qualifications: nb_qualifs,
    nb_adresses_supprimees: nb_supprimees,
    date_recalcul: new Date().toISOString(),
  }

  // ── Mise à jour sessions_prospection ────────────────────────
  const { error: updErr } = await supabase
    .from('sessions_prospection')
    .update({ rapport_json, nb_portes: nb_visites })
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // ── Mise à jour planning_sessions (si liée) ─────────────────
  await supabase
    .from('planning_sessions')
    .update({
      nb_adresses_visitees:   nb_visites,
      nb_contacts,
      nb_maisons_qualifiees:  nb_maisons,
      nb_immeubles_qualifies: nb_immeubles,
      nb_syndics_qualifies:   nb_syndics,
      nb_adresses_supprimees: nb_supprimees,
      updated_at:             new Date().toISOString(),
    })
    .eq('session_id', params.id)
  // Pas d'erreur bloquante si pas de planning_session liée

  return NextResponse.json({
    ok: true,
    session_id: params.id,
    date_session: session.date_session,
    rapport_json,
    avant: {
      nb_contacts:  ancien.nb_contacts  ?? 0,
      nb_visites:   ancien.nb_visites   ?? 0,
    },
    apres: { nb_contacts, nb_visites },
    changed: (ancien.nb_contacts ?? 0) !== nb_contacts,
  })
}
