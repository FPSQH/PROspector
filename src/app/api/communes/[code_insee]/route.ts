import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { code_insee: string } }

// DELETE /api/communes/[code_insee]
export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { code_insee } = params

  // Supprimer les adresses associées
  await supabase
    .from('adresses')
    .delete()
    .eq('code_insee', code_insee)

  // Supprimer la commune
  const { error } = await supabase
    .from('communes')
    .delete()
    .eq('commercial_id', user.id)
    .eq('code_insee', code_insee)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
