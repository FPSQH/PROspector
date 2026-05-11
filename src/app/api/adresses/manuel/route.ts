import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/adresses/manuel — ajouter une adresse manuelle persistante
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { lat, lon, numero, nom_voie, code_insee, commune, code_postal, type_habitat, type_bien, nb_bal } = body

  if (!lat || !lon || !code_insee)
    return NextResponse.json({ error: 'lat, lon et code_insee requis' }, { status: 400 })

  // Vérifier que la commune appartient au secteur du commercial
  const { data: communeData } = await supabase
    .from('communes')
    .select('code_insee')
    .eq('commercial_id', user.id)
    .eq('code_insee', code_insee)
    .single()

  if (!communeData) return NextResponse.json({ error: 'Commune non autorisée' }, { status: 403 })

  // Générer un ID BAN-like pour l'adresse manuelle
  const id = `${code_insee}_manuel_${Date.now()}`

  const { data: adresse, error } = await supabase
    .from('adresses')
    .insert({
      id,
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      numero:        numero?.trim()   || null,
      nom_voie:      nom_voie?.trim() || 'Adresse manuelle',
      code_insee,
      commune:       commune || '',
      code_postal:   code_postal || '',
      type_habitat:  type_habitat || null,
      type_bien:     type_bien   || null,
      nb_bal:        nb_bal ? parseInt(nb_bal) : null,
      prospectable:  true,
      is_manuelle:   true,
      ajoutee_par:   user.id,
      ajoutee_le:    new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ adresse })
}
