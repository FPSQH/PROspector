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

  // Nom — max 45 caractères
  if (body.nom !== undefined) {
    const nom = String(body.nom).trim()
    if (nom.length > 0) updates.nom = nom.slice(0, 45)
  }

  // Couleur
  if (body.couleur !== undefined && /^#[0-9A-Fa-f]{6}$/.test(body.couleur))
    updates.couleur = body.couleur

  // Numéro
  if (body.numero !== undefined) updates.numero = Number(body.numero)

  // Champs qualification
  if (body.type_bien    !== undefined) updates.type_bien    = body.type_bien
  if (body.has_commerce !== undefined) updates.has_commerce = body.has_commerce
  if (body.statut       !== undefined) updates.statut       = body.statut
  if (body.motif_exclusion !== undefined) updates.motif_exclusion = body.motif_exclusion
  if (body.notes        !== undefined) updates.notes        = body.notes

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })

const { error } = await supabase
  .from('zones_prospection')
  .update(updates)
  .eq('id', params.id)

if (error) return NextResponse.json({ error: error.message }, { status: 400 })
return NextResponse.json({ ok: true })
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
