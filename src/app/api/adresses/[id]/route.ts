import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { type_bien, has_commerce } = body

  const update: Record<string, any> = {}
  if (type_bien   !== undefined) update.type_bien   = type_bien
  if (has_commerce !== undefined) update.has_commerce = has_commerce

  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'Aucune donnee a mettre a jour' }, { status: 400 })

  const { data, error } = await supabase
    .from('adresses')
    .update(update)
    .eq('id', params.id)
    .select('id, type_bien, has_commerce')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ adresse: data })
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data, error } = await supabase
    .from('adresses')
    .select('id, lat, lon, type_bien, has_commerce, prospectable, nb_bal')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ adresse: data })
}
