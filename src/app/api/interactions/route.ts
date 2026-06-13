import { getEffectiveCommercialId } from '@/lib/delegation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const body = await req.json().catch(() => ({}))
  const {
    session_id, adresse_id, resultat, action,
    type_habitat, nb_etages, nom_boite,
    type_contact, note, date_relance,
    presence,
    contact_id,
    observations_terrain,
    statut_adresse,
    bien_vide,
    bien_abandonne,
  } = body

  if (!session_id || !adresse_id || !resultat) {
    return NextResponse.json(
      { error: 'session_id, adresse_id et resultat sont requis' },
      { status: 400 }
    )
  }

  const actionMap: Record<string, string> = {
    'flyer':           'flyer_depose',
    'courrier':        'courrier_depose',
    'boite':           'courrier_depose',
    'rien':            'rien',
    'flyer_depose':    'flyer_depose',
    'courrier_depose': 'courrier_depose',
  }
  const actionNorm = action ? (actionMap[action] ?? 'rien') : 'rien'

  // Normalisation resultat → valeurs autorisées par contrainte PostgreSQL
  // CHECK ((resultat = ANY (ARRAY['pas_de_reponse', 'contact_etabli'])))
  const resultatMap: Record<string, string> = {
    'contact':         'contact_etabli',   // BottomSheet envoie 'contact' → mapper
    'contact_etabli':  'contact_etabli',
    'pas_de_reponse':  'pas_de_reponse',
    'exclusion':       'pas_de_reponse',   // hors contrainte → fallback
    'supprimee':       'pas_de_reponse',   // hors contrainte → fallback
  }
  const resultatNorm = resultatMap[resultat] ?? 'pas_de_reponse'

  // presence = true si contact établi (source: BottomSheet ou normalisation)
  const presenceVal = presence === true
    || resultat === 'contact'
    || resultat === 'contact_etabli'
    || resultatNorm === 'contact_etabli'

  const { data: session } = await supabase
    .from('sessions_prospection')
    .select('id, statut')
    .eq('id', session_id)
    .eq('commercial_id', effectiveId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session non trouvee' }, { status: 404 })

  const adminDb = createAdminClient()

  const { data: existing } = await adminDb
    .from('interactions')
    .select('id')
    .eq('session_id', session_id)
    .eq('adresse_id', adresse_id)
    .maybeSingle()

  let interaction: any

  if (existing) {
    const { data, error } = await adminDb
      .from('interactions')
      .update({
        resultat:     resultatNorm,   // valeur normalisée compatible contrainte DB
        action:               actionNorm,
        type_habitat:         type_habitat         ?? null,
        nb_etages:            nb_etages            ?? null,
        nom_boite:            nom_boite            ?? null,
        type_contact:         type_contact         ?? null,
        note:                 note                 ?? null,
        date_relance:         date_relance         ?? null,
        presence:             presenceVal,
        contact_id:           contact_id           ?? null,
        statut_adresse:       statut_adresse       ?? null,
        observations_terrain: observations_terrain ?? {},
        bien_vide:            bien_vide            ?? null,
        bien_abandonne:       bien_abandonne       ?? null,
        updated_at:           new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) {
      console.error('[interactions] update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    interaction = data
  } else {
    const { data, error } = await adminDb
      .from('interactions')
      .insert({
        session_id,
        adresse_id,
        commercial_id:        effectiveId,
        resultat:     resultatNorm,   // valeur normalisée compatible contrainte DB
        action:               actionNorm,
        type_habitat:         type_habitat         ?? null,
        nb_etages:            nb_etages            ?? null,
        nom_boite:            nom_boite            ?? null,
        type_contact:         type_contact         ?? null,
        note:                 note                 ?? null,
        date_relance:         date_relance         ?? null,
        presence:             presenceVal,
        contact_id:           contact_id           ?? null,
        statut_adresse:       statut_adresse       ?? null,
        observations_terrain: observations_terrain ?? {},
        bien_vide:            bien_vide            ?? null,
        bien_abandonne:       bien_abandonne       ?? null,
      })
      .select()
      .single()
    if (error) {
      console.error('[interactions] insert error:', error.message, { session_id, adresse_id, resultat })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    interaction = data
  }

  adminDb.rpc('increment_session_portes', { p_session_id: session_id })
    .then(({ error }) => { if (error) console.warn('[interactions] rpc:', error.message) })
    .catch(() => {})

  return NextResponse.json({ interaction, nouveau: !existing })
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const { searchParams } = new URL(req.url)
  const session_id = searchParams.get('session_id')
  const adresse_id = searchParams.get('adresse_id')

  const adminDb = createAdminClient()
  let query = adminDb
    .from('interactions')
    .select('*')
    .eq('commercial_id', effectiveId)
    .order('created_at', { ascending: false })

  if (session_id) query = query.eq('session_id', session_id)
  if (adresse_id) query = query.eq('adresse_id', adresse_id)

  const { data, error } = await query.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ interactions: data ?? [] })
}
