import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// PATCH /api/adresses/[id]
// Permet de mettre à jour les infos métier d'une adresse :
// nom_boite, type_bien, nb_bal
export async function PATCH(req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Seuls ces champs sont modifiables par le commercial
  const allowed = ['nom_boite', 'type_bien', 'nb_bal']
  const updates: any = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucun champ valide' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('adresses')
    .update(updates)
    .eq('id', params.id)
    .select('id, nom_boite, type_bien, nb_bal')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ adresse: data })
}
