import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: zone } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, commercial_id, nb_adresses, nb_prospectables, capacite_theorique, polygone_geojson, created_at, updated_at')
    .eq('id', params.id)
    .single()

  if (!zone) return NextResponse.json({ error: 'Zone non trouvée' }, { status: 404 })

  // Itinéraire TSP dans l'ordre
  const { data: itineraire } = await supabase
    .from('itineraires_zone')
    .select(`
      ordre,
      adresse:adresses (
        id, lat, lon, numero, nom_voie, type_bien, nb_bal
      )
    `)
    .eq('zone_id', params.id)
    .order('ordre')

  return NextResponse.json({ zone, itineraire: itineraire ?? [] })
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.nom !== undefined)    updates.nom    = String(body.nom).slice(0, 100)
  if (body.couleur !== undefined && /^#[0-9A-Fa-f]{6}$/.test(body.couleur))
    updates.couleur = body.couleur
  if (body.numero !== undefined) updates.numero = Number(body.numero)

  const { data, error } = await supabase
    .from('zones_prospection')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ zone: data })
}

export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { error } = await supabase
    .from('zones_prospection')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
