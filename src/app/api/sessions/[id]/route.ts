import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// GET /api/sessions/[id] — détail session + adresses avec statut
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions_prospection')
    .select(`
      id, zone_id, date_session, heure_debut, heure_fin,
      heure_debut_reel, heure_fin_reel, statut,
      nb_portes, nb_boites, notes,
      zones_prospection (id, nom, couleur, numero, nb_prospectables)
    `)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session non trouvee' }, { status: 404 })

  // Charger les adresses de la zone avec leur statut pour cette session
  const allAdresses: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('adresses')
      .select('id, lat, lon, numero, nom_voie, type_bien, nb_bal, prospectable')
      .eq('zone_id', session.zone_id)
      .not('lat', 'is', null)
      .range(from, from + 999)
    if (error || !data || data.length === 0) break
    allAdresses.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  // Charger les interactions de cette session
  const { data: interactions } = await supabase
    .from('interactions')
    .select('id, adresse_id, resultat, action, type_contact, type_habitat, note, date_relance')
    .eq('session_id', params.id)

  // Charger l'itinéraire
  const { data: itineraire } = await supabase
    .from('itineraires_zone')
    .select('adresse_id, ordre')
    .eq('zone_id', session.zone_id)
    .order('ordre')

  const interMap = new Map((interactions ?? []).map((i: any) => [i.adresse_id, i]))
  const itinMap  = new Map((itineraire ?? []).map((i: any) => [i.adresse_id, i.ordre]))

  const adressesAvecStatut = allAdresses.map((a) => {
    const inter = interMap.get(a.id)
    const statut = !inter ? 'a_faire'
      : inter.resultat === 'contact_etabli' ? 'contact'
      : inter.action === 'flyer' || inter.action === 'courrier' ? 'boite'
      : 'visite'
    return {
      ...a,
      statut_carte: statut,
      interaction:  inter ?? null,
      ordre:        itinMap.get(a.id) ?? 9999,
    }
  }).sort((a, b) => a.ordre - b.ordre)

  const nb_visites = adressesAvecStatut.filter((a) => a.statut_carte !== 'a_faire').length

  return NextResponse.json({
    session,
    adresses:   adressesAvecStatut,
    nb_total:   allAdresses.length,
    nb_visites,
    pct_couvert: allAdresses.length > 0
      ? Math.round((nb_visites / allAdresses.length) * 100)
      : 0,
  })
}

// PATCH /api/sessions/[id] — mettre à jour (terminer, annuler, modifier)
// Body : { statut?, heure_fin?, nb_portes?, nb_boites?, notes? }
export async function PATCH(req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { statut, heure_fin, nb_portes, nb_boites, notes, date_session, zone_id } = body

  const updates: any = {}
  if (statut)       updates.statut       = statut
  if (heure_fin)    updates.heure_fin    = heure_fin
  if (heure_fin)    updates.heure_fin_reel = heure_fin
  if (nb_portes !== undefined) updates.nb_portes = nb_portes
  if (nb_boites !== undefined) updates.nb_boites = nb_boites
  if (notes !== undefined) updates.notes = notes
  if (date_session) updates.date_session = date_session
  if (zone_id)      updates.zone_id      = zone_id

  // Si on termine la session, enregistrer l'heure de fin réelle
  if (statut === 'realisee' && !heure_fin) {
    updates.heure_fin_reel = new Date().toTimeString().slice(0, 5)
  }

  const { data, error } = await supabase
    .from('sessions_prospection')
    .update(updates)
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}
