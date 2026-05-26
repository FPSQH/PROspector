import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_STATUT  = ['prospect','qualification','estimation','mandat','perdu']
const VALID_HORIZON = ['moins_6_mois','6_12_mois','1_2_ans','plus_2_ans']
const VALID_TYPE    = ['interet_vente','projet_moyen','projet_long','voisin_relais','recommandation','commercant','autre']

const SAFE_FIELDS = [
  'nom','prenom','tel1','tel2','email1','email2','notes',
  'date_relance','hors_secteur','commercial_cible_id',
  'adresse_id','adresse_libre','adresse_lat','adresse_lon',
]

function calcEcheance(qualDate: string, horizon: string): string | null {
  const months: Record<string, number> = {
    'moins_6_mois': 6, '6_12_mois': 12, '1_2_ans': 24, 'plus_2_ans': 36,
  }
  const m = months[horizon]
  if (!m || !qualDate) return null
  const d = new Date(qualDate)
  d.setMonth(d.getMonth() + m)
  return d.toISOString().split('T')[0]
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  // Champs libres
  for (const field of SAFE_FIELDS) {
    if (field in body) updates[field] = body[field] ?? null
  }

  // Zone (FK UUID — pas de CHECK constraint)
  if ('zone_id' in body) updates.zone_id = body.zone_id ?? null

  // Champs avec CHECK constraint
  if (body.statut_pipeline != null && VALID_STATUT.includes(body.statut_pipeline)) {
    updates.statut_pipeline = body.statut_pipeline
  }
  if (body.type_contact != null && VALID_TYPE.includes(body.type_contact)) {
    updates.type_contact = body.type_contact
  } else if ('type_contact' in body && (body.type_contact === '' || body.type_contact === null)) {
    updates.type_contact = null
  }

  // Horizon avec dates automatiques
  if ('horizon_vente' in body) {
    if (body.horizon_vente != null && body.horizon_vente !== '' && VALID_HORIZON.includes(body.horizon_vente)) {
      updates.horizon_vente = body.horizon_vente
      const qualDate = body.horizon_qualification_date ?? new Date().toISOString().split('T')[0]
      updates.horizon_qualification_date = qualDate
      updates.horizon_echeance_date      = calcEcheance(qualDate, body.horizon_vente)
    } else if (body.horizon_vente === null || body.horizon_vente === '') {
      updates.horizon_vente               = null
      updates.horizon_qualification_date  = null
      updates.horizon_echeance_date       = null
    }
  }

  const { error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)

  if (error) {
    console.error('[contacts PATCH] error:', error.message, JSON.stringify(updates))
    if (error.message.includes('violates check constraint')) {
      const safeOnly: Record<string, any> = { updated_at: updates.updated_at }
      for (const field of SAFE_FIELDS) {
        if (field in updates) safeOnly[field] = updates[field]
      }
      const { error: e2 } = await supabase
        .from('contacts').update(safeOnly)
        .eq('id', params.id).eq('commercial_id', user.id)
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      console.warn('[contacts PATCH] sauvegardé sans contraintes CHECK — appliquer migration DB')
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select(`
      id, adresse_id, interaction_id, nom, prenom, tel1, tel2, email1,
      type_contact, notes, date_relance, statut_pipeline,
      horizon_vente, horizon_qualification_date, horizon_echeance_date,
      adresse_libre, adresse_lat, adresse_lon, zone_id, hors_secteur,
      created_at, updated_at,
      adresses ( id, numero, nom_voie, code_postal, commune, lat, lon, zone_id, zones_prospection ( id, nom, couleur ) ),
      zones_prospection ( id, nom, couleur )
    `)
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
