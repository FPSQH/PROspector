import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// DELETE /api/zones/snapshots/[id] — supprimer un snapshot
export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { error } = await supabase
    .from('zones_snapshots')
    .delete()
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
