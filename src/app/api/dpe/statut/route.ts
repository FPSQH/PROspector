// src/app/api/dpe/statut/route.ts
//
// GET /api/dpe/statut
//
// Retourne le statut de chargement BAN + DPE pour chaque commune du commercial.
//
// IMPORTANT : ban_chargee est calculé sur le VRAI compte d'adresses,
// pas sur le flag chargee_at — ce qui rend le statut fiable quelle que
// soit la façon dont la commune a été chargée (onboarding, import manuel, etc.).
//
// Auto-réparation : si une commune a des adresses mais chargee_at = null,
// la route corrige silencieusement le flag pour éviter tout désynchronisation.

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Communes du commercial
  const { data: communes } = await supabase
    .from('communes')
    .select('id, code_insee, nom, code_postal, chargee_at, dpe_chargee_at, derniere_verif_dpe, nb_dpe')
    .eq('commercial_id', user.id)

  if (!communes) return NextResponse.json({ statuts: [] })

  const statuts = await Promise.all(
    communes.map(async (c: any) => {

      // Compte réel d'adresses BAN (source de vérité)
      const { count: nbAdresses } = await supabase
        .from('adresses')
        .select('id', { count: 'exact', head: true })
        .eq('code_insee', c.code_insee)

      // Compte de DPE chargés
      const { count: nbDpe } = await supabase
        .from('dpe_logement')
        .select('id', { count: 'exact', head: true })
        .eq('code_insee', c.code_insee)

      const banChargee = (nbAdresses ?? 0) > 0

      // Auto-réparation : chargee_at manquant mais adresses présentes
      if (banChargee && !c.chargee_at) {
        await supabase
          .from('communes')
          .update({ chargee_at: new Date().toISOString() })
          .eq('id', c.id)
      }

      return {
        code_insee:     c.code_insee,
        nom:            c.nom,
        code_postal:    c.code_postal,
        commune_id:     c.id,
        ban_chargee:    banChargee,
        nb_adresses:    nbAdresses ?? 0,
        dpe_chargee:        !!c.dpe_chargee_at || (nbDpe ?? 0) > 0,
        dpe_chargee_at:     c.dpe_chargee_at,
        derniere_verif_dpe: c.derniere_verif_dpe ?? null,
        nb_dpe:             nbDpe ?? c.nb_dpe ?? 0,
      }
    })
  )

  return NextResponse.json({ statuts })
}
