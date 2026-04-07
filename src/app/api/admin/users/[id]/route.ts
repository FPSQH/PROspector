import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: caller } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (caller?.role !== 'manager') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Vérifier que le commercial cible appartient bien à ce manager
  const { data: target } = await admin
    .from('commerciaux').select('manager_id').eq('id', params.id).single()
  if (target?.manager_id !== user.id) {
    return NextResponse.json({ error: 'Cible non autorisée' }, { status: 403 })
  }

  // Supprimer le compte Auth (la ligne commerciaux sera supprimée par cascade)
  const { error } = await admin.auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
