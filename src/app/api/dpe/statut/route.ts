// src/app/api/dpe/statut/route.ts
//
// GET /api/dpe/statut
// Retourne le statut de chargement DPE pour les communes du commercial.
// Utilisé par le client pour le polling (même pattern que /api/communes/statut).

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: communes } = await supabase
    .from('communes')
    .select('id, code_insee, nom, code_postal, chargee_at, dpe_chargee_at')
    .eq('commercial_id', user.id)

  if (!communes) return NextResponse.json({ statuts: [] })

  const statuts = await Promise.all(
    communes.map(async (c: any) => {
      const { count } = await supabase
        .from('dpe_logement')
        .select('id', { count: 'exact', head: true })
        .eq('code_insee', c.code_insee)

      return {
        code_insee:     c.code_insee,
        nom:            c.nom,
        code_postal:    c.code_postal,
        commune_id:     c.id,
        ban_chargee:    !!c.chargee_at,
        dpe_chargee:    !!c.dpe_chargee_at,
        dpe_chargee_at: c.dpe_chargee_at,
        nb_dpe:         count ?? 0,
      }
    })
  )

  return NextResponse.json({ statuts })
}
