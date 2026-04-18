import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// Calcule un score de priorité (0-100) pour une adresse
function calcScore(a: any): number {
  if (a.statut_prospectabilite === 'non_prospectable' || a.mode_prospection === 'exclure') return 0
  let score = 0

  // Signal DPE
  const dpeDate = a.latest_dpe_date ? new Date(a.latest_dpe_date) : null
  const now = new Date()
  if (dpeDate) {
    const days = (now.getTime() - dpeDate.getTime()) / (1000 * 60 * 60 * 24)
    if (days <= 30)       score += 100
    else if (days <= 90)  score += 40
    else if (days <= 180) score += 20
    else if (days <= 365) score += 5
  }

  // Type de bien
  if (a.type_habitat === 'individuel' || a.type_bien === 'maison') score += 5
  if (a.type_habitat === 'activite' || a.type_bien === 'commerce') score -= 10

  // Mode de prospection
  if (a.mode_prospection === 'porte_a_porte') score += 5

  // Projet immobilier actif
  if (a.has_projet_actif) score += 15

  // Jamais visité dans le mois
  if (!a.derniere_visite) score += 15

  return Math.min(100, Math.max(0, score))
}

// GET /api/zones/[id]/adresses — avec score et données Phase 2
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: zone } = await supabase
    .from('zones_prospection')
    .select('id, commercial_id')
    .eq('id', params.id)
    .eq('commercial_id', user.id)
    .single()

  if (!zone) return NextResponse.json({ error: 'Zone non trouvée' }, { status: 404 })

  // Charger les adresses avec champs Phase 2
  const allAdresses: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('adresses')
      .select(`
        id, lat, lon, numero, nom_voie, code_postal, commune,
        type_bien, nb_bal, has_commerce, prospectable,
        type_habitat, mode_prospection, statut_prospectabilite,
        motif_exclusion, courrier_cible_possible, commentaire_adresse,
        nom_syndic, nb_acces_observe
      `)
      .eq('zone_id', params.id)
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .range(from, from + 999)

    if (error || !data || data.length === 0) break
    allAdresses.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  if (!allAdresses.length) return NextResponse.json({ adresses: [], nb: 0 })

  const adresseIds = allAdresses.map((a: any) => a.id)

  // DPE les plus récents par adresse (batch)
  const dpeMap: Record<string, string> = {}
  const { data: dpes } = await supabase
    .from('dpe_logement')
    .select('adresse_id, date_etablissement')
    .in('adresse_id', adresseIds)
    .order('date_etablissement', { ascending: false })

  for (const d of (dpes ?? [])) {
    if (!dpeMap[d.adresse_id]) dpeMap[d.adresse_id] = d.date_etablissement
  }

  // Projets actifs par adresse (via contacts)
  const projetSet = new Set<string>()
  const { data: contacts } = await supabase
    .from('contacts')
    .select('adresse_id, projets_immobiliers(statut)')
    .in('adresse_id', adresseIds)
    .eq('commercial_id', user.id)

  for (const c of (contacts ?? [])) {
    const projets = (c as any).projets_immobiliers ?? []
    if (projets.some((p: any) => p.statut === 'actif')) {
      projetSet.add(c.adresse_id)
    }
  }

  // Dernière visite par adresse (interactions de la semaine)
  const visiteMap: Record<string, string> = {}
  const oneWeekAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data: interactions } = await supabase
    .from('interactions')
    .select('adresse_id, created_at')
    .in('adresse_id', adresseIds)
    .gte('created_at', oneWeekAgo)
    .order('created_at', { ascending: false })

  for (const i of (interactions ?? [])) {
    if (!visiteMap[i.adresse_id]) visiteMap[i.adresse_id] = i.created_at
  }

  // Assembler avec score
  const result = allAdresses.map((a: any) => {
    const enriched = {
      ...a,
      latest_dpe_date:   dpeMap[a.id] ?? null,
      has_projet_actif:  projetSet.has(a.id),
      derniere_visite:   visiteMap[a.id] ?? null,
    }
    return {
      ...enriched,
      score: calcScore(enriched),
    }
  })

  return NextResponse.json({ adresses: result, nb: result.length })
}
