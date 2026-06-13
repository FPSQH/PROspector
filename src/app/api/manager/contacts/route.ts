import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/manager/contacts
// Params: commercial_id, filtre (tous|relance), recherche, type_contact
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Vérifier que l'utilisateur est manager
  const { data: profile } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const url   = new URL(req.url)
  const cid   = url.searchParams.get('commercial_id') ?? ''
  const filtre    = url.searchParams.get('filtre')       ?? 'tous'
  const recherche = url.searchParams.get('recherche')    ?? ''
  const typeFiltre = url.searchParams.get('type_contact') ?? ''

  // IDs de l'équipe
  const { data: equipe } = await supabase
    .from('commerciaux').select('id').eq('manager_id', user.id)
  const teamIds = (equipe ?? []).map(c => c.id)
  if (!teamIds.length) return NextResponse.json({ contacts: [] })

  const targetIds = cid && teamIds.includes(cid) ? [cid] : teamIds

  let query = supabase
    .from('contacts')
    .select(`
      id, commercial_id, adresse_id, nom, prenom, tel1, email1,
      type_contact, statut_pipeline, horizon_vente,
      horizon_qualification_date, horizon_echeance_date,
      date_relance, notes, adresse_libre, adresse_lat, adresse_lon, zone_id,
      created_at, updated_at,
      adresses (id, numero, nom_voie, code_postal, commune, lat, lon, zone_id,
        zones_prospection (id, nom, couleur)
      ),
      zones_prospection (id, nom, couleur)
    `)
    .in('commercial_id', targetIds)
    .order('created_at', { ascending: false })

  if (filtre === 'relance') {
    query = query.not('date_relance', 'is', null)
    query = query.lte('date_relance', new Date().toISOString().slice(0, 10))
  }
  if (typeFiltre) query = query.eq('type_contact', typeFiltre)
  if (recherche) {
    query = query.or(`prenom.ilike.%${recherche}%,nom.ilike.%${recherche}%,tel1.ilike.%${recherche}%`)
  }

  const { data: contacts } = await query.limit(500)

  // Enrichir avec le nom du commercial
  const { data: commerciaux } = await supabase
    .from('commerciaux').select('id, nom, prenom').in('id', targetIds)
  const nomMap = new Map((commerciaux ?? []).map(c => [c.id, `${c.prenom} ${c.nom}`]))

  const enriched = (contacts ?? []).map(c => ({
    ...c,
    commercial_nom: nomMap.get(c.commercial_id) ?? '',
  }))

  return NextResponse.json({ contacts: enriched })
}
