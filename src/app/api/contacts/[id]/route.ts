import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Colonnes modifiables de la table contacts
const VALID_FIELDS = [
  'nom', 'prenom', 'tel1', 'tel2', 'email1', 'email2',
  'type_contact', 'notes', 'date_relance', 'statut_pipeline',
  'horizon_vente', 'hors_secteur', 'commercial_cible_id',
]

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // ✅ N'envoyer que les colonnes valides (évite adresses, id, created_at, etc.)
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const field of VALID_FIELDS) {
    if (field in body) updates[field] = body[field] ?? null
  }

  const { error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (error) {
    console.error('[contacts PATCH] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('*, adresses(id, numero, nom_voie, code_postal, commune)')
    .eq('id', params.id)
    .single()

  return NextResponse.json({ contact: contact ?? {} })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
