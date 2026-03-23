import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// GET /api/zones/[id]/historique
// Retourne les 5 dernières versions d'une zone
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data, error } = await supabase
    .from('zones_historique')
    .select('id, version, nom, nb_adresses, type_modif, created_at, modifie_par')
    .eq('zone_id', params.id)
    .order('version', { ascending: false })
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ historique: data ?? [] })
}
