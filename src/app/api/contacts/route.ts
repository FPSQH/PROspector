import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_TYPE_CONTACT = ['interet_vente','projet_moyen','projet_long','voisin_relais','recommandation','commercant','autre']
const VALID_STATUT       = ['prospect','qualification','estimation','mandat','perdu']
const VALID_HORIZON      = ['moins_6_mois','6_12_mois','1_2_ans','plus_2_ans']

/** Calcule la date d'échéance à partir de la date de qualification et de l'horizon */
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

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filtre       = searchParams.get('filtre')       ?? 'tous'
  const recherche    = searchParams.get('recherche')    ?? ''
  const type_contact = searchParams.get('type_contact') ?? ''
  const zone_id      = searchParams.get('zone_id')      ?? ''

  let query = supabase
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
    .eq('commercial_id', user.id)
    .order('updated_at', { ascending: false })

  if (filtre === 'relance') {
    query = query.not('date_relance', 'is', null).lte('date_relance', new Date().toISOString().split('T')[0])
  }
  if (zone_id)      query = query.eq('zone_id', zone_id)
  if (type_contact) query = query.eq('type_contact', type_contact)
  if (recherche)    query = query.or(`nom.ilike.%${recherche}%,prenom.ilike.%${recherche}%,notes.ilike.%${recherche}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  const insert: Record<string, any> = {
    commercial_id:  user.id,
    adresse_id:     body.adresse_id     || null,
    interaction_id: body.interaction_id || null,
    nom:            body.nom            || null,
    prenom:         body.prenom         || null,
    tel1:           body.tel1           || null,
    tel2:           body.tel2           || null,
    email1:         body.email1         || null,
    email2:         body.email2         || null,
    notes:          body.notes          || null,
    date_relance:   body.date_relance   || null,
    type_contact:   VALID_TYPE_CONTACT.includes(body.type_contact)  ? body.type_contact  : null,
    statut_pipeline:VALID_STATUT.includes(body.statut_pipeline)     ? body.statut_pipeline : 'prospect',
    hors_secteur:   body.hors_secteur === true,
    // Adresse enrichie
    adresse_libre:  body.adresse_libre  || null,
    adresse_lat:    body.adresse_lat    ?? null,
    adresse_lon:    body.adresse_lon    ?? null,
    zone_id:        body.zone_id        || null,
  }

  // Horizon avec dates automatiques
  if (VALID_HORIZON.includes(body.horizon_vente)) {
    const qualDate = new Date().toISOString().split('T')[0]
    insert.horizon_vente                = body.horizon_vente
    insert.horizon_qualification_date   = qualDate
    insert.horizon_echeance_date        = calcEcheance(qualDate, body.horizon_vente)
  }

  const { data, error } = await supabase.from('contacts').insert(insert).select(`
    id, adresse_id, nom, prenom, tel1, email1,
    type_contact, statut_pipeline, horizon_vente, horizon_qualification_date, horizon_echeance_date,
    adresse_libre, adresse_lat, adresse_lon, zone_id,
    adresses ( id, numero, nom_voie, code_postal, commune, lat, lon ),
    zones_prospection ( id, nom, couleur )
  `).single()

  if (error) {
    if (error.message.includes('violates check constraint')) {
      console.warn('[contacts POST] CHECK constraint, retry sans statut_pipeline')
      const { statut_pipeline, ...insertSafe } = insert
      const { data: d2, error: e2 } = await supabase.from('contacts').insert(insertSafe).select().single()
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      return NextResponse.json({ contact: d2 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ contact: data })
}
