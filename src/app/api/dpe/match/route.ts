// src/app/api/dpe/match/route.ts
//
// POST /api/dpe/match
//
// Pour une commune donnée :
//  1. Matching textuel normalisé (DPE → adresses BAN)
//  2. Matching spatial en mémoire (fallback haversine, rayon 30m)
//  3. Qualification automatique des adresses matchées (via RPC qualify_adresse_from_dpe)
//
// Body : { code_insee, commune_id? }
// Retourne : { nb_matched_textuel, nb_matched_spatial, nb_qualified, nb_unmatched }

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'
import { normalizeVoie, normalizeNumero } from '@/lib/dpe/normalize'

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

/** Distance haversine en mètres */
function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Met à jour dpe_chargee_at sur la commune, par id ou par code_insee */
async function marquerCommuneDpeChargee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code_insee: string,
  commune_id?: string
) {
  const q = supabase
    .from('communes')
    .update({ dpe_chargee_at: new Date().toISOString() })
  if (commune_id) {
    await q.eq('id', commune_id)
  } else {
    await q.eq('code_insee', code_insee)
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.code_insee) {
    return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })
  }

  const { code_insee, commune_id } = body

  try {
    // ── 1. Charger les adresses BAN de la commune ─────────────────────────
    const adresses: { id: string; numero: string; nom_voie: string; lat: number; lon: number }[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('id, numero, nom_voie, lat, lon')
        .eq('code_insee', code_insee)
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      adresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }

    if (adresses.length === 0) {
      return NextResponse.json({
        nb_matched_textuel: 0, nb_matched_spatial: 0,
        nb_qualified: 0, nb_unmatched: 0,
        message: 'Aucune adresse BAN trouvée pour cette commune',
      })
    }

    // Index de matching textuel : clé = "numero|voie_normalisee" → adresse
    const textIndex = new Map<string, { id: string; lat: number; lon: number }>()
    for (const a of adresses) {
      const key = `${normalizeNumero(a.numero)}|${normalizeVoie(a.nom_voie || '')}`
      if (!textIndex.has(key)) {
        textIndex.set(key, { id: a.id, lat: a.lat, lon: a.lon })
      }
    }

    // ── 2. Charger les DPE non matchés de cette commune ───────────────────
    const dpes: any[] = []
    from = 0
    while (true) {
      const { data, error } = await supabase
        .from('dpe_logement')
        .select('id, numero_dpe, adresse_brute, type_batiment, surface_habitable, annee_construction, nombre_appartement, etiquette_dpe, etiquette_ges, date_etablissement, geom')
        .eq('code_insee', code_insee)
        .eq('match_confiance', 'non_matche')
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      dpes.push(...data)
      if (data.length < 1000) break
      from += 1000
    }

    if (dpes.length === 0) {
      // Aucun DPE à matcher — peut-être déjà fait
      await marquerCommuneDpeChargee(supabase, code_insee, commune_id)
      return NextResponse.json({
        nb_matched_textuel: 0, nb_matched_spatial: 0,
        nb_qualified: 0, nb_unmatched: 0,
        message: 'Aucun DPE non matché trouvé',
      })
    }

    // ── 3. Passe 1 : Matching textuel ─────────────────────────────────────
    let nbTextuel = 0
    const unmatchedDpes: any[] = []

    for (const dpe of dpes) {
      const adresseBrute = dpe.adresse_brute || ''

      // Extraire numéro et voie depuis l'adresse brute
      const match = adresseBrute.match(/^(\d+\s*(?:bis|ter|quater|b|t|q)?)\s+(.+)/i)
      let numero = ''
      let voie   = adresseBrute

      if (match) {
        numero = match[1]
        voie   = match[2]
        // Retirer le CP et la ville en fin de voie
        voie = voie.replace(/\s+\d{5}\s+.+$/, '').trim()
      }

      const key = `${normalizeNumero(numero)}|${normalizeVoie(voie)}`
      const found = textIndex.get(key)

      if (found) {
        dpe._matched_adresse_id = found.id
        dpe._match_confiance    = 'textuel_exact'
        nbTextuel++
      } else {
        unmatchedDpes.push(dpe)
      }
    }

    // ── 4. Passe 2 : Matching spatial en mémoire ──────────────────────────
    let nbSpatial = 0

    for (const dpe of unmatchedDpes) {
      if (!dpe.geom) continue

      // Extraire lat/lon du EWKT ou GeoJSON stocké
      let dLon: number | null = null
      let dLat: number | null = null

      const geomStr = typeof dpe.geom === 'string' ? dpe.geom : JSON.stringify(dpe.geom)

      // Format EWKT : SRID=4326;POINT(lon lat)
      const ewktMatch = geomStr.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
      if (ewktMatch) {
        dLon = parseFloat(ewktMatch[1])
        dLat = parseFloat(ewktMatch[2])
      }

      // Format GeoJSON : {"type":"Point","coordinates":[lon,lat]}
      if (dLon === null && typeof dpe.geom === 'object' && dpe.geom.coordinates) {
        dLon = dpe.geom.coordinates[0]
        dLat = dpe.geom.coordinates[1]
      }

      if (dLon === null || dLat === null || isNaN(dLon) || isNaN(dLat)) continue

      // Chercher l'adresse BAN la plus proche dans un rayon de 30m
      let bestId:   string | null = null
      let bestDist: number = Infinity

      for (const a of adresses) {
        const dist = haversineMetres(dLat, dLon, a.lat, a.lon)
        if (dist < 30 && dist < bestDist) {
          bestDist = dist
          bestId   = a.id
        }
      }

      if (bestId) {
        dpe._matched_adresse_id = bestId
        dpe._match_confiance    = 'spatial_proche'
        nbSpatial++
      }
    }

    // ── 5. Sauvegarder les matchs en base ─────────────────────────────────
    const matchedDpes = dpes.filter((d: any) => d._matched_adresse_id)

    for (const batch of chunk(matchedDpes, 100)) {
      for (const dpe of batch) {
        await supabase
          .from('dpe_logement')
          .update({
            adresse_id:      dpe._matched_adresse_id,
            match_confiance: dpe._match_confiance,
          })
          .eq('id', dpe.id)
      }
    }

    // ── 6. Qualification des adresses ─────────────────────────────────────
    // Grouper les DPE matchés par adresse_id
    const dpeParAdresse = new Map<string, any[]>()
    for (const dpe of matchedDpes) {
      const aId = dpe._matched_adresse_id
      if (!dpeParAdresse.has(aId)) dpeParAdresse.set(aId, [])
      dpeParAdresse.get(aId)!.push(dpe)
    }

    let nbQualified = 0

    for (const [adresseId, dpesAdresse] of dpeParAdresse) {
      // Trier par date décroissante → le plus récent en premier
      dpesAdresse.sort((a: any, b: any) => {
        const da = a.date_etablissement || '0000'
        const db = b.date_etablissement || '0000'
        return db.localeCompare(da)
      })

      const latest = dpesAdresse[0]

      // Estimer nb_bal depuis les DPE
      let nbAppartEstime: number | null = null
      if (latest.type_batiment === 'immeuble' && latest.nombre_appartement) {
        nbAppartEstime = latest.nombre_appartement
      } else {
        const nbDpeAppart = dpesAdresse.filter(
          (d: any) => d.type_batiment === 'appartement'
        ).length
        if (nbDpeAppart >= 2) nbAppartEstime = nbDpeAppart
      }

      // Appeler la fonction PL/pgSQL de qualification
      const { error } = await supabase.rpc('qualify_adresse_from_dpe', {
        p_adresse_id:    adresseId,
        p_type_batiment: latest.type_batiment || null,
        p_surface:       latest.surface_habitable || null,
        p_annee:         latest.annee_construction || null,
        p_nb_appart:     nbAppartEstime,
        p_etiquette_dpe: latest.etiquette_dpe || null,
        p_etiquette_ges: latest.etiquette_ges || null,
        p_dpe_date:      latest.date_etablissement || null,
        p_dpe_numero:    latest.numero_dpe || null,
      })

      if (!error) nbQualified++
      else console.error(`[DPE] Erreur qualification ${adresseId}:`, error.message)
    }

    // ── 7. Marquer la commune comme DPE chargé ────────────────────────────
    await marquerCommuneDpeChargee(supabase, code_insee, commune_id)

    const nbUnmatched = dpes.length - matchedDpes.length

    console.log(
      `[DPE] Match ${code_insee}: ${nbTextuel} textuel, ${nbSpatial} spatial, ` +
      `${nbQualified} qualifiés, ${nbUnmatched} non matchés sur ${dpes.length} DPE`
    )

    return NextResponse.json({
      nb_matched_textuel: nbTextuel,
      nb_matched_spatial: nbSpatial,
      nb_qualified:       nbQualified,
      nb_unmatched:       nbUnmatched,
    })

  } catch (err: any) {
    console.error('[DPE] Erreur matching:', err)
    return NextResponse.json({ error: err.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}
