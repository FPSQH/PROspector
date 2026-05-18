import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Valeurs acceptées par les CHECK constraints DB
// Si la DB a des valeurs différentes, le fallback retire le champ plutôt que de planter
const VALID_STATUT   = ['prospect','qualification','estimation','mandat','perdu']
const VALID_HORIZON  = ['moins_6_mois','6_12_mois','1_2_ans','plus_2_ans']
const VALID_TYPE     = ['interet_vente','projet_moyen','projet_long','voisin_relais','recommandation','commercant','autre']

const SAFE_FIELDS = ['nom','prenom','tel1','tel2','email1','email2','notes','date_relance','hors_secteur','commercial_cible_id']

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Champs libres (pas de CHECK constraint)
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const field of SAFE_FIELDS) {
    if (field in body) updates[field] = body[field] ?? null
  }

  // Champs avec CHECK constraint — inclus seulement si la valeur est valide
  if (body.statut_pipeline != null && VALID_STATUT.includes(body.statut_pipeline)) {
    updates.statut_pipeline = body.statut_pipeline
  }
  if (body.horizon_vente != null && VALID_HORIZON.includes(body.horizon_vente)) {
    updates.horizon_vente = body.horizon_vente
  }
  if (body.type_contact != null && VALID_TYPE.includes(body.type_contact)) {
    updates.type_contact = body.type_contact
  }

  const { error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (error) {
    console.error('[contacts PATCH] error:', error.message, JSON.stringify(updates))
    // Retry sans les champs à contrainte si CHECK violation
    if (error.message.includes('violates check constraint')) {
      const safeOnly: Record<string, any> = { updated_at: updates.updated_at }
      for (const field of SAFE_FIELDS) {
        if (field in updates) safeOnly[field] = updates[field]
      }
      const { error: error2 } = await supabase
        .from('contacts').update(safeOnly)
        .eq('id', params.id).eq('commercial_id', user.id)
      if (error2) return NextResponse.json({ error: error2.message }, { status: 500 })
      console.warn('[contacts PATCH] saved sans champs contrainte — CHECK constraint DB à corriger')
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('*, adresses(id, numero, nom_voie, code_postal, commune)')
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  return NextResponse.json({ contact: contact ?? {} })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { error } = await supabase
    .from('contacts').delete()
    .eq('id', params.id).eq('commercial_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
