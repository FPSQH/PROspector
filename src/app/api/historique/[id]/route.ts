import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions_prospection')
    .select(`
      id, zone_id, date_session, heure_debut, heure_fin,
      heure_debut_reel, heure_fin_reel, statut, type_session,
      commune_nom, commune_code_insee, nom_tournee,
      nb_portes, nb_boites, notes, rapport_json,
      zones_prospection (nom, couleur, numero)
    `)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session non trouvee' }, { status: 404 })

  const adminDb = createAdminClient()

  const { data: rawInteractions } = await adminDb
    .from('interactions')
    .select('id, adresse_id, resultat, action, type_contact, type_habitat, statut_adresse, note, date_relance, contact_id')
    .eq('session_id', params.id)

  const interactions = rawInteractions ?? []

  const adresseIds = [...new Set(interactions.map((i: any) => i.adresse_id).filter(Boolean))]
  const adressesMap: Record<string, any> = {}
  if (adresseIds.length > 0) {
    const { data: adresses } = await adminDb
      .from('adresses')
      .select('id, numero, nom_voie, commune, code_postal, lat, lon')
      .in('id', adresseIds)
    for (const a of adresses ?? []) adressesMap[a.id] = a
  }

  const contactIds = [...new Set(interactions.map((i: any) => i.contact_id).filter(Boolean))]
  let contacts: any[] = []
  if (contactIds.length > 0) {
    const { data: ctcs } = await adminDb
      .from('contacts')
      .select('id, nom, prenom, tel1, statut_pipeline, type_contact, created_at')
      .in('id', contactIds)
      .eq('commercial_id', user.id)
    contacts = ctcs ?? []
  }

  const interactionsWithAdresse = interactions.map((i: any) => ({
    ...i,
    adresse: adressesMap[i.adresse_id] ?? null,
  }))

  return NextResponse.json({ session, interactions: interactionsWithAdresse, contacts })
}
