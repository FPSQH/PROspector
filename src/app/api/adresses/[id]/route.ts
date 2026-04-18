import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_MODE_PROSPECTION = ['porte_a_porte','boitage','mixte','exclure']
const VALID_STATUT_PROSPECTABILITE = ['prospectable','a_confirmer','non_prospectable']
const VALID_MOTIF_EXCLUSION = ['parc_public','administration','equipement_public','bureaux_uniquement','commerce_uniquement','site_ferme','doublon_ban','autre']
const VALID_TYPE_HABITAT = ['individuel','collectif','mixte','activite','public','inconnu']
const VALID_TYPE_BIEN = ['maison','appartement','logement_social','commerce','inconnu']

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const update: Record<string, any> = {}

  if (body.type_bien !== undefined && VALID_TYPE_BIEN.includes(body.type_bien)) update.type_bien = body.type_bien
  if (body.nb_bal !== undefined) update.nb_bal = body.nb_bal
  if (body.has_commerce !== undefined) update.has_commerce = body.has_commerce
  if (body.mode_prospection !== undefined && VALID_MODE_PROSPECTION.includes(body.mode_prospection)) update.mode_prospection = body.mode_prospection
  if (body.statut_prospectabilite !== undefined && VALID_STATUT_PROSPECTABILITE.includes(body.statut_prospectabilite)) update.statut_prospectabilite = body.statut_prospectabilite
  if (body.motif_exclusion !== undefined) update.motif_exclusion = VALID_MOTIF_EXCLUSION.includes(body.motif_exclusion) ? body.motif_exclusion : null
  if (body.type_habitat !== undefined && VALID_TYPE_HABITAT.includes(body.type_habitat)) update.type_habitat = body.type_habitat
  if (body.nb_acces_observe !== undefined) update.nb_acces_observe = body.nb_acces_observe
  if (body.courrier_cible_possible !== undefined) update.courrier_cible_possible = body.courrier_cible_possible
  if (body.commentaire_adresse !== undefined) update.commentaire_adresse = body.commentaire_adresse?.substring(0, 150) || null

  if (!Object.keys(update).length) return NextResponse.json({ error: 'Aucun champ valide' }, { status: 400 })

  const { data, error } = await supabase.from('adresses').update(update).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ adresse: data })
}
