// src/app/api/dpe/match/route.ts
//
// POST /api/dpe/match
//
// Effectue le matching entre DPE importés et adresses BAN.
// V2 : Inclus les 3 passes (Exact, Voie, Spatial 100m) et synchronisation complète des champs.
// Optimisé pour éviter les timeouts Vercel (10s) via Promise.all par batches.

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'
import { normalizeVoie, normalizeNumero, toIsoDate } from '@/lib/dpe/normalize'

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.code_insee) return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })

  const { code_insee } = body

  try {
    // ── 1. Charger TOUTES les adresses BAN de la commune (Pagination offset) ──
    const adresses: any[] = []
    let fromAddr = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('id, numero, nom_voie, lat, lon, latest_dpe_date, dpe_etiquette, type_bien')
        .eq('code_insee', code_insee)
        .range(fromAddr, fromAddr + 999)
      if (error || !data?.length) break
      adresses.push(...data)
      if (data.length < 1000) break
      fromAddr += 1000
    }

    if (!adresses.length) return NextResponse.json({ nb_qualified: 0, message: 'Aucune adresse BAN' })

    const textIndex = new Map<string, any>()
    const voieIndex = new Map<string, any[]>()
    const addrMap   = new Map<string, any>()
    for (const a of adresses) {
      const vNorm = normalizeVoie(a.nom_voie || ''), nNorm = normalizeNumero(a.numero)
      textIndex.set(`${nNorm}|${vNorm}`, a)
      if (!voieIndex.has(vNorm)) voieIndex.set(vNorm, [])
      voieIndex.get(vNorm)!.push(a)
      addrMap.set(a.id, a)
    }

    // ── 2. Charger TOUS les DPE (Nouveaux OU avec adresse_id présent pour rattrapage) ──
    const dpes: any[] = []
    let fromDpe = 0
    while (true) {
      const { data, error } = await supabase
        .from('dpe_logement')
        .select(`
          id, numero_dpe, adresse_brute, type_batiment, etiquette_dpe, etiquette_ges,
          date_etablissement, surface_habitable, annee_construction, nombre_appartement, geom,
          match_confiance, adresse_id
        `)
        .eq('code_insee', code_insee)
        .or('match_confiance.eq.non_matche,adresse_id.not.is.null')
        .range(fromDpe, fromDpe + 999)
      if (error || !data?.length) break
      dpes.push(...data)
      if (data.length < 1000) break
      fromDpe += 1000
    }

    const toUpdateDPE = []
    const adresseToQualify = new Map<string, any[]>()

    // ── 3. Logique de Matching en 3 passes ──
    for (const dpe of dpes) {
      let matchedAddrId = dpe.adresse_id
      let matchConfiance = dpe.match_confiance

      if (!matchedAddrId || matchConfiance === 'non_matche') {
        const { numero, voie } = parseAdresseBrute(dpe.adresse_brute || '')
        const vNorm = normalizeVoie(voie)
        const key = `${normalizeNumero(numero)}|${vNorm}`
        const found = textIndex.get(key)

        if (found) {
          matchedAddrId = found.id
          matchConfiance = 'textuel_exact'
        } else {
          const candidates = voieIndex.get(vNorm)
          if (vNorm && candidates?.length) {
            matchedAddrId = candidates[0].id
            matchConfiance = 'textuel_voie'
          }
        }
      }

      if (!matchedAddrId || matchConfiance === 'non_matche') {
        const coords = extractCoords(dpe.geom)
        if (coords) {
          let bestDist = 100
          for (const a of adresses) {
            const d = haversineMetres(coords.lat, coords.lon, a.lat, a.lon)
            if (d < bestDist) { bestDist = d; matchedAddrId = a.id; matchConfiance = 'spatial_proche' }
          }
        }
      }

      if (matchedAddrId) {
        if (dpe.adresse_id !== matchedAddrId || dpe.match_confiance !== matchConfiance) {
          toUpdateDPE.push({ id: dpe.id, adresse_id: matchedAddrId, match_confiance: matchConfiance })
        }
        if (!adresseToQualify.has(matchedAddrId)) adresseToQualify.set(matchedAddrId, [])
        adresseToQualify.get(matchedAddrId)!.push(dpe)
      }
    }

    // ── 4. Mise à jour DPE ──
    for (const batch of chunk(toUpdateDPE, 100)) {
      await Promise.all(batch.map(item =>
        supabase.from('dpe_logement').update({ adresse_id: item.adresse_id, match_confiance: item.match_confiance }).eq('id', item.id)
      ))
    }

    // ── 5. Qualification massive avec synchronisation complète des champs ──
    let nbQualified = 0
    const addrUpdates = []

    for (const [addrId, dpesOfAddr] of adresseToQualify) {
      dpesOfAddr.sort((a, b) => (b.date_etablissement || '').localeCompare(a.date_etablissement || ''))
      const latest = dpesOfAddr[0]
      const isoDate = toIsoDate(latest.date_etablissement)
      const etiquette = (latest.etiquette_dpe || '').charAt(0).toUpperCase() || null

      const currentAddr = addrMap.get(addrId)
      // Ne mettre à jour que si changement réel ou date manquante (rattrapage)
      if (currentAddr.latest_dpe_date !== isoDate || currentAddr.dpe_etiquette !== etiquette) {
        const typeBien = (() => {
          const tb = (latest.type_batiment || '').toLowerCase()
          if (tb === 'maison') return 'maison'
          if (tb === 'appartement' || tb === 'immeuble') return 'appartement'
          return currentAddr.type_bien || 'inconnu'
        })()

        const payload: any = {
          latest_dpe_date: isoDate,
          dpe_etiquette:   etiquette,
          dpe_numero:      latest.numero_dpe,
          type_bien:       typeBien,
          updated_at:      new Date().toISOString()
        }
        if (latest.surface_habitable) payload.surface_habitable = latest.surface_habitable
        if (latest.annee_construction) payload.annee_construction = latest.annee_construction
        if (latest.etiquette_ges) payload.dpe_ges = (latest.etiquette_ges || '').charAt(0).toUpperCase()
        if (latest.type_batiment === 'immeuble' && latest.nombre_appartement) payload.nb_bal = latest.nombre_appartement

        addrUpdates.push({ id: addrId, ...payload })
      }
    }

    // Exécution groupée des updates adresses (Batches de 50 pour la stabilité)
    for (const batch of chunk(addrUpdates, 50)) {
      await Promise.all(batch.map(upd =>
        supabase.from('adresses').update(upd).eq('id', upd.id)
      ))
      nbQualified += batch.length
    }

    await supabase.from('communes').update({ dpe_chargee_at: new Date().toISOString() }).eq('code_insee', code_insee)

    return NextResponse.json({ nb_qualified: nbQualified, total_processed: dpes.length, matches_updated: toUpdateDPE.length })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function parseAdresseBrute(raw: string): { numero: string; voie: string } {
  const match = raw.trim().match(/^(\d+\s*(?:bis|ter|b|t|q)?)\s+(.+)/i)
  if (match) return { numero: match[1].trim(), voie: match[2].replace(/\s+\d{5}.*$/, '').trim() }
  return { numero: '', voie: raw.replace(/\s+\d{5}.*$/, '').trim() }
}

function extractCoords(geom: any): { lat: number; lon: number } | null {
  if (!geom) return null
  const geomStr = typeof geom === 'string' ? geom : JSON.stringify(geom)
  const ewkt = geomStr.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
  if (ewkt) return { lon: parseFloat(ewkt[1]), lat: parseFloat(ewkt[2]) }
  if (typeof geom === 'object' && geom.coordinates) return { lon: geom.coordinates[0], lat: geom.coordinates[1] }
  return null
}
