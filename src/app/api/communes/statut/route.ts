import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/communes/statut
// Retourne le statut de chargement BAN pour toutes les communes du commercial connecté
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Communes du commercial
  const { data: communes, error } = await supabase
    .from('communes')
    .select('id, code_insee, nom, chargee_at')
    .eq('commercial_id', user.id)

  if (error || !communes) {
    return NextResponse.json({ statuts: [] })
  }

  // Pour chaque commune, compter les adresses (batch de 5 max)
  const statuts = await Promise.all(
    communes.map(async (commune: any) => {
      const { count } = await supabase
        .from('adresses')
        .select('id', { count: 'exact', head: true })
        .eq('code_insee', commune.code_insee)

      return {
        code_insee:  commune.code_insee,
        nom:         commune.nom,
        chargee:     !!commune.chargee_at,
        chargee_at:  commune.chargee_at,
        nb_adresses: count ?? 0,
      }
    })
  )

  return NextResponse.json({ statuts })
}
