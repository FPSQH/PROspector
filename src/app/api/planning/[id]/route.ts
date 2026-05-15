import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SESSION_SELECT =
  '*, zones_prospection:zone_id(id,nom,couleur,numero), zone2:zone_id_2(id,nom,couleur,numero)'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Champs autorisés à patcher
  const allowed = ['statut', 'zone_id', 'zone_id_2', 'nb_adresses_visitees', 'nb_contacts', 'notes']
  const patch: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) patch[k] = body[k]
  }
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'Aucun champ valide' }, { status: 400 })

  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('planning_sessions')
    .update(patch)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select(SESSION_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}
