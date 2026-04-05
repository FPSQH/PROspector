// src/app/api/dpe/match/route.ts
//
// POST /api/dpe/match
//
// Pour une commune donnée :
//  1.  Matching textuel exact  : numero + voie normalisés        → textuel_exact
//  1b. Matching voie seule     : voie sans numéro (lieu-dit…)   → textuel_voie
//  2.  Matching spatial        : haversine en mémoire, rayon 100m → spatial_proche
//  3.  Qualification automatique des adresses matchées (via RPC qualify_adresse_from_dpe)
//
// Body : { code_insee, commune_id? }
// Retourne : { nb_matched_textuel, nb_matched_voie, nb_matched_spatial, nb_qualified, nb_unmatched }

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
  commune_id ? await q.eq('id', commune_id) : await q.eq('code_insee', code_insee)
}

/** Extraire numéro + voie depuis une adresse brute ADEME */
function parseAdresseBrute(adresseBrute: string): { numero: string; voie: string } {
  const raw = adresseBrute.trim()

  // Cas 1 : commence par un numéro → "11 Rue de Marsaneix 22220 Trédarzec"
  const matchNumero = raw.match(/^(\d+\s*(?:bis|ter|quater|b|t|q)?)\s+(.+)/i)
  if (matchNumero) {
    const numero = matchNumero[1].trim()
    const voie   = matchNumero[2].replace(/\s+\d{5}(?:\s+.+)?$/, '').trim()
    return { numero, voie }
  }

  // Cas 2 : pas de numéro → "Rue de Marsaneix 22220 Trédarzec" ou "Kérivoalan 22220 Trédarzec"
  const voie = raw.replace(/\s+\d{5}(?:\s+.+)?$/, '').trim()
  return { numero: '', voie }
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
        nb_matched_textuel: 0, nb_matched_voie: 0, nb_matched_spatial: 0,
        nb_qualified: 0, nb_unmatched: 0,
        message: 'Aucune adresse BAN trouvée pour cette commune',
      })
    }

    // Index exact : "numero|voie_norm" → adresse
    const textIndex = new Map<string, { id: string; lat: number; lon: number }>()
    // Index voie seule : "voie_norm" → liste d'adresses (pour matching sans numéro)
    const voieIndex = new Map<string, { id: string; lat: number; lon: number }[]>()

    for (const a of adresses) {
      const voieNorm = normalizeVoie(a.nom_voie || '')
      const numNorm  = normalizeNumero(a.numero)

      // Index exact
      const key = `${numNorm}|${voieNorm}`
      if (!textIndex.has(key)) textIndex.set(key, { id: a.id, lat: a.lat, lon: a.lon })

      // Index voie seule
      if (!voieIndex.has(voieNorm)) voieIndex.set(voieNorm, [])
      voieIndex.get(voieNorm)!.push({ id: a.id, lat: a.lat, lon: a.lon })
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
      await marquerCommuneDpeChargee(supabase, code_insee, commune_id)
      return NextResponse.json({
        nb_matched_textuel: 0, nb_matched_voie: 0, nb_matched_spatial: 0,
        nb_qualified: 0, nb_unmatched: 0,
        message: 'Aucun DPE non matché trouvé',
      })
    }

    // ── 3. Passe 1 : Matching textuel exact (numero + voie) ───────────────
    let nbTextuel = 0
    let nbVoie    = 0
    const afterPasse1: any[] = []

    for (const dpe of dpes) {
      const { numero, voie } = parseAdresseBrute(dpe.adresse_brute || '')

      // Passe 1a — exact (numéro + voie)
      if (numero && voie) {
        const key   = `${normalizeNumero(numero)}|${normalizeVoie(voie)}`
        const found = textIndex.get(key)
        if (found) {
          dpe._matched_adresse_id = found.id
          dpe._match_confiance    = 'textuel_exact'
          nbTextuel++
          continue
        }
      }

      // Passe 1b — voie seule (pas de numéro, ou numéro non trouvé)
      const voieNorm   = normalizeVoie(voie)
      const candidates = voieIndex.get(voieNorm)
      if (voieNorm && candidates && candidates.length > 0) {
        // Si geom disponible, prendre le plus proche parmi les candidats de la voie
        let best = candidates[0]
        if (dpe.geom) {
          const coords = extractCoords(dpe.geom)
          if (coords) {
            let bestDist = Infinity
            for (const c of candidates) {
              const d = haversineMetres(coords.lat, coords.lon, c.lat, c.lon)
              if (d < bestDist) { bestDist = d; best = c }
            }
          }
        }
        dpe._matched_adresse_id = best.id
        dpe._match_confiance    = 'textuel_voie'
        nbVoie++
        continue
      }

      afterPasse1.push(dpe)
    }

    // ── 4. Passe 2 : Matching spatial en mémoire (rayon 100m) ────────────
    let nbSpatial = 0
    const unmatched: any[] = []

    for (const dpe of afterPasse1) {
      const coords = extractCoords(dpe.geom)
      if (!coords) { unmatched.push(dpe); continue }

      let bestId:   string | null = null
      let bestDist: number = Infinity

      for (const a of adresses) {
        const dist = haversineMetres(coords.lat, coords.lon, a.lat, a.lon)
        if (dist < 100 && dist < bestDist) {   // rayon élargi à 100m
          bestDist = dist
          bestId   = a.id
        }
      }

      if (bestId) {
        dpe._matched_adresse_id = bestId
        dpe._match_confiance    = 'spatial_proche'
        nbSpatial++
      } else {
        unmatched.push(dpe)
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
    const dpeParAdresse = new Map<string, any[]>()
    for (const dpe of matchedDpes) {
      const aId = dpe._matched_adresse_id
      if (!dpeParAdresse.has(aId)) dpeParAdresse.set(aId, [])
      dpeParAdresse.get(aId)!.push(dpe)
    }

    let nbQualified = 0

    for (const [adresseId, dpesAdresse] of dpeParAdresse) {
      dpesAdresse.sort((a: any, b: any) => {
        const da = a.date_etablissement || '0000'
        const db = b.date_etablissement || '0000'
        return db.localeCompare(da)
      })

      const latest = dpesAdresse[0]

      let nbAppartEstime: number | null = null
      if (latest.type_batiment === 'immeuble' && latest.nombre_appartement) {
        nbAppartEstime = latest.nombre_appartement
      } else {
        const nbDpeAppart = dpesAdresse.filter((d: any) => d.type_batiment === 'appartement').length
        if (nbDpeAppart >= 2) nbAppartEstime = nbDpeAppart
      }

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

    const nbUnmatched = unmatched.length

    console.log(
      `[DPE] Match ${code_insee}: ${nbTextuel} exact, ${nbVoie} voie, ` +
      `${nbSpatial} spatial, ${nbQualified} qualifiés, ${nbUnmatched} non matchés ` +
      `sur ${dpes.length} DPE`
    )

    return NextResponse.json({
      nb_matched_textuel: nbTextuel,
      nb_matched_voie:    nbVoie,
      nb_matched_spatial: nbSpatial,
      nb_qualified:       nbQualified,
      nb_unmatched:       nbUnmatched,
    })

  } catch (err: any) {
    console.error('[DPE] Erreur matching:', err)
    return NextResponse.json({ error: err.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}

/** Extraire lat/lon depuis un champ geom EWKT ou GeoJSON */
function extractCoords(geom: any): { lat: number; lon: number } | null {
  if (!geom) return null

  const geomStr = typeof geom === 'string' ? geom : JSON.stringify(geom)

  // EWKT : SRID=4326;POINT(lon lat)
  const ewkt = geomStr.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
  if (ewkt) {
    const lon = parseFloat(ewkt[1])
    const lat = parseFloat(ewkt[2])
    if (!isNaN(lon) && !isNaN(lat)) return { lat, lon }
  }

  // GeoJSON : {"type":"Point","coordinates":[lon,lat]}
  if (typeof geom === 'object' && geom.coordinates) {
    const lon = geom.coordinates[0]
    const lat = geom.coordinates[1]
    if (!isNaN(lon) && !isNaN(lat)) return { lat, lon }
  }

  return null
}
