// ============================================================
// POST /api/dvf/enrichir-adresses
//
// Enrichit le champ type_bien des adresses d'une commune
// en croisant avec les mutations DVF :
//   - par id_parcelle si disponible sur l'adresse
//   - sinon par proximité géographique (50m) + numéro de voie
//
// Body : { code_insee: string }
// Retourne : { nb_enrichies, nb_maisons, nb_appartements }
// ============================================================

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET ?? '05091974'

export async function POST(req: Request) {
  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader !== CRON_SECRET) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const codeInsee: string | undefined = body?.code_insee
  if (!codeInsee) return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })

  const adminDb = createAdminClient()

  // ── Récupérer les adresses de la commune (type_bien inconnu ou null) ──
  const { data: adresses } = await adminDb
    .from('adresses')
    .select('id, lat, lon, type_bien, numero, nom_voie, id_parcelle')
    .eq('code_insee', codeInsee)

  if (!adresses?.length) return NextResponse.json({ nb_enrichies: 0, nb_maisons: 0, nb_appartements: 0 })

  // ── Récupérer toutes les mutations DVF de la commune ─────────────
  const { data: mutations } = await adminDb
    .from('dvf_mutations')
    .select('id_parcelle, type_local, longitude, latitude, adresse_numero, adresse_nom_voie, nature_mutation')
    .eq('code_commune', codeInsee)
    .eq('nature_mutation', 'Vente')
    .in('type_local', ['Maison', 'Appartement'])
    .not('longitude', 'is', null)
    .not('latitude', 'is', null)

  if (!mutations?.length) return NextResponse.json({ nb_enrichies: 0, nb_maisons: 0, nb_appartements: 0 })

  // Index DVF par id_parcelle pour correspondance directe
  const dvfByParcelle = new Map<string, string>()
  for (const mut of mutations) {
    if (mut.id_parcelle && !dvfByParcelle.has(mut.id_parcelle)) {
      dvfByParcelle.set(mut.id_parcelle, mut.type_local)
    }
  }

  const toUpdate: { id: string; type_bien: string }[] = []

  const R = 6371000
  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(a))
  }

  function dvfTypeToTypeBien(typeLocal: string): 'maison' | 'appartement' | null {
    if (typeLocal === 'Maison') return 'maison'
    if (typeLocal === 'Appartement') return 'appartement'
    return null
  }

  for (const adr of adresses) {
    if (adr.type_bien && adr.type_bien !== 'inconnu') continue

    // Priorité 1 : correspondance par id_parcelle cadastrale
    if ((adr as any).id_parcelle) {
      const typeLocal = dvfByParcelle.get((adr as any).id_parcelle)
      if (typeLocal) {
        const typeBien = dvfTypeToTypeBien(typeLocal)
        if (typeBien) { toUpdate.push({ id: adr.id, type_bien: typeBien }); continue }
      }
    }

    // Priorité 2 : proximité GPS (50m)
    if (adr.lat == null || adr.lon == null) continue

    let bestDist = Infinity
    let bestType: string | null = null

    for (const mut of mutations) {
      if (!mut.longitude || !mut.latitude) continue
      const dist = haversine(adr.lat, adr.lon, mut.latitude, mut.longitude)
      if (dist < bestDist && dist <= 50) {
        bestDist = dist
        bestType = mut.type_local
      }
    }

    if (bestType) {
      const typeBien = dvfTypeToTypeBien(bestType)
      if (typeBien) toUpdate.push({ id: adr.id, type_bien: typeBien })
    }
  }

  // ── Mise à jour en base ────────────────────────────────────────────
  let nbEnrichies = 0
  let nbMaisons = 0
  let nbAppartements = 0

  for (const u of toUpdate) {
    const { error } = await adminDb
      .from('adresses')
      .update({ type_bien: u.type_bien })
      .eq('id', u.id)

    if (!error) {
      nbEnrichies++
      if (u.type_bien === 'maison') nbMaisons++
      else if (u.type_bien === 'appartement') nbAppartements++
    }
  }

  return NextResponse.json({ nb_enrichies: nbEnrichies, nb_maisons: nbMaisons, nb_appartements: nbAppartements })
}
