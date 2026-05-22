// src/app/api/dpe/match/route.ts
//
// POST /api/dpe/match
//
// Matching DPE ↔ adresses BAN — V3
// 4 passes :
//   1. Exact  : numero normalisé + voie normalisée
//   2. Voie   : voie normalisée + numéro le plus proche (au lieu de [0])
//   3. Spatial 200m : rayon élargi de 100m → 200m
//   4. Postal + numéro : numero seul sur le code_insee (lieu-dits, voies inconnues)

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
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Similarité Jaccard sur bigrammes (fuzzy voie) ─────────────────────────
function bigrams(s: string): Set<string> {
  const bg = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2))
  return bg
}
function jaccardSim(a: string, b: string): number {
  const ba = bigrams(a); const bb = bigrams(b)
  let inter = 0
  for (const g of ba) if (bb.has(g)) inter++
  return inter / (ba.size + bb.size - inter)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.code_insee) return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })

  const { code_insee } = body

  try {
    // ── 1. Charger toutes les adresses BAN ────────────────────────────────
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

    // ── 2. Index adresses ─────────────────────────────────────────────────
    const textIndex  = new Map<string, any>()          // "num|voie" → adresse
    const voieIndex  = new Map<string, any[]>()        // "voie"    → [adresses]
    const numIndex   = new Map<string, any[]>()        // "num"     → [adresses] (passe 4)
    const addrMap    = new Map<string, any>()

    for (const a of adresses) {
      const vNorm = normalizeVoie(a.nom_voie || '')
      const nNorm = normalizeNumero(a.numero)
      textIndex.set(`${nNorm}|${vNorm}`, a)
      if (!voieIndex.has(vNorm)) voieIndex.set(vNorm, [])
      voieIndex.get(vNorm)!.push(a)
      if (nNorm) {
        if (!numIndex.has(nNorm)) numIndex.set(nNorm, [])
        numIndex.get(nNorm)!.push(a)
      }
      addrMap.set(a.id, a)
    }

    // ── 3. Charger DPE non matchés ────────────────────────────────────────
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

    const toUpdateDPE: any[]              = []
    const adresseToQualify                = new Map<string, any[]>()
    const stats = { p1: 0, p2: 0, p3: 0, p4: 0, fuzzy: 0, none: 0 }

    // ── 4. Matching en 4 passes ───────────────────────────────────────────
    for (const dpe of dpes) {
      let matchedAddrId  = dpe.adresse_id
      let matchConfiance = dpe.match_confiance

      // Sauter les DPE déjà bien matchés (pas non_matche)
      if (matchedAddrId && matchConfiance !== 'non_matche') {
        if (!adresseToQualify.has(matchedAddrId)) adresseToQualify.set(matchedAddrId, [])
        adresseToQualify.get(matchedAddrId)!.push(dpe)
        continue
      }

      const { numero, voie } = parseAdresseBrute(dpe.adresse_brute || '')
      const vNorm = normalizeVoie(voie)
      const nNorm = normalizeNumero(numero)

      // PASSE 1 — Exact : num + voie normalisés
      const exact = textIndex.get(`${nNorm}|${vNorm}`)
      if (exact) {
        matchedAddrId = exact.id; matchConfiance = 'textuel_exact'; stats.p1++
      }

      // PASSE 2 — Voie + numéro le plus proche
      if (!matchedAddrId && vNorm) {
        const candidates = voieIndex.get(vNorm) ?? []
        if (candidates.length === 1) {
          matchedAddrId = candidates[0].id; matchConfiance = 'textuel_voie'; stats.p2++
        } else if (candidates.length > 1 && nNorm) {
          // Choisir le candidat dont le numéro normalisé est le plus proche
          const nNum = parseInt(nNorm.replace(/\D/g, ''), 10) || 0
          let bestDiff = Infinity; let bestCand: any = null
          for (const c of candidates) {
            const cNum = parseInt(normalizeNumero(c.numero).replace(/\D/g, ''), 10) || 0
            const diff = Math.abs(cNum - nNum)
            if (diff < bestDiff) { bestDiff = diff; bestCand = c }
          }
          if (bestCand && bestDiff <= 10) {
            matchedAddrId = bestCand.id; matchConfiance = 'textuel_voie_proche'; stats.p2++
          }
        }
      }

      // PASSE 2b — Fuzzy voie (Jaccard ≥ 0.75) + numéro exact
      if (!matchedAddrId && vNorm.length >= 4) {
        let bestScore = 0.74; let bestCand: any = null
        for (const [vRef, cands] of voieIndex) {
          const score = jaccardSim(vNorm, vRef)
          if (score > bestScore) {
            // Parmi les candidats de cette voie, chercher le numéro
            const exact2 = cands.find(c => normalizeNumero(c.numero) === nNorm)
            const pick   = exact2 ?? (cands.length === 1 ? cands[0] : null)
            if (pick) { bestScore = score; bestCand = pick }
          }
        }
        if (bestCand) {
          matchedAddrId = bestCand.id; matchConfiance = 'textuel_fuzzy'; stats.fuzzy++
        }
      }

      // PASSE 3 — Spatial 200m (rayon élargi vs 100m en V2)
      if (!matchedAddrId) {
        const coords = extractCoords(dpe.geom)
        if (coords) {
          let bestDist = 200; let bestAddr: any = null
          for (const a of adresses) {
            if (a.lat == null || a.lon == null) continue
            const d = haversineMetres(coords.lat, coords.lon, a.lat, a.lon)
            if (d < bestDist) { bestDist = d; bestAddr = a }
          }
          if (bestAddr) {
            matchedAddrId  = bestAddr.id
            matchConfiance = bestDist <= 100 ? 'spatial_proche' : 'spatial_200m'
            stats.p3++
          }
        }
      }

      // PASSE 4 — Numéro seul sur la commune (lieu-dits, voies non référencées BAN)
      if (!matchedAddrId && nNorm) {
        const candidates = numIndex.get(nNorm) ?? []
        if (candidates.length === 1) {
          matchedAddrId = candidates[0].id; matchConfiance = 'numero_seul'; stats.p4++
        }
      }

      if (matchedAddrId) {
        if (dpe.adresse_id !== matchedAddrId || dpe.match_confiance !== matchConfiance) {
          toUpdateDPE.push({ id: dpe.id, adresse_id: matchedAddrId, match_confiance: matchConfiance })
        }
        if (!adresseToQualify.has(matchedAddrId)) adresseToQualify.set(matchedAddrId, [])
        adresseToQualify.get(matchedAddrId)!.push(dpe)
      } else {
        stats.none++
        // Marquer explicitement comme non matché pour éviter de le retraiter inutilement
        if (dpe.match_confiance !== 'non_matche') {
          toUpdateDPE.push({ id: dpe.id, adresse_id: null, match_confiance: 'non_matche' })
        }
      }
    }

    // ── 5. Update DPE ─────────────────────────────────────────────────────
    for (const batch of chunk(toUpdateDPE, 100)) {
      await Promise.all(batch.map(item =>
        supabase.from('dpe_logement')
          .update({ adresse_id: item.adresse_id, match_confiance: item.match_confiance })
          .eq('id', item.id)
      ))
    }

    // ── 6. Qualification adresses ─────────────────────────────────────────
    let nbQualified = 0
    const addrUpdates: any[] = []

    for (const [addrId, dpesOfAddr] of adresseToQualify) {
      dpesOfAddr.sort((a, b) => (b.date_etablissement || '').localeCompare(a.date_etablissement || ''))
      const latest  = dpesOfAddr[0]
      const isoDate = toIsoDate(latest.date_etablissement)
      const etiquette = (latest.etiquette_dpe || '').charAt(0).toUpperCase() || null

      const currentAddr = addrMap.get(addrId)
      if (!currentAddr) continue

      if (currentAddr.latest_dpe_date !== isoDate || currentAddr.dpe_etiquette !== etiquette) {
        const typeBien = (() => {
          const tb = (latest.type_batiment || '').toLowerCase()
          if (tb === 'maison')                             return 'maison'
          if (tb === 'appartement' || tb === 'immeuble')   return 'appartement'
          return currentAddr.type_bien || 'inconnu'
        })()

        const payload: any = {
          latest_dpe_date: isoDate,
          dpe_etiquette:   etiquette,
          dpe_numero:      latest.numero_dpe,
          type_bien:       typeBien,
          updated_at:      new Date().toISOString(),
        }
        if (latest.surface_habitable)  payload.surface_habitable  = latest.surface_habitable
        if (latest.annee_construction) payload.annee_construction = latest.annee_construction
        if (latest.etiquette_ges)      payload.dpe_ges            = (latest.etiquette_ges || '').charAt(0).toUpperCase()
        if (latest.type_batiment === 'immeuble' && latest.nombre_appartement)
          payload.nb_bal = latest.nombre_appartement

        addrUpdates.push({ id: addrId, ...payload })
      }
    }

    for (const batch of chunk(addrUpdates, 50)) {
      await Promise.all(batch.map(upd =>
        supabase.from('adresses').update(upd).eq('id', upd.id)
      ))
      nbQualified += batch.length
    }

    await supabase.from('communes')
      .update({ dpe_chargee_at: new Date().toISOString() })
      .eq('code_insee', code_insee)

    return NextResponse.json({
      nb_qualified:    nbQualified,
      total_processed: dpes.length,
      matches_updated: toUpdateDPE.length,
      stats,  // détail des passes pour debug
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function parseAdresseBrute(raw: string): { numero: string; voie: string } {
  // Nettoyer code postal + ville en fin de chaîne
  const cleaned = raw.trim()
    .replace(/\s+\d{5}(\s+.+)?$/, '')  // "22220 TRÉGUIER" → supprimé
    .trim()
  const match = cleaned.match(/^(\d+\s*(?:bis|ter|b|t|q(?:uater)?)?)\s+(.+)/i)
  if (match) return { numero: match[1].trim(), voie: match[2].trim() }
  // Pas de numéro (lieu-dit, résidence…)
  return { numero: '', voie: cleaned }
}

function extractCoords(geom: any): { lat: number; lon: number } | null {
  if (!geom) return null
  const geomStr = typeof geom === 'string' ? geom : JSON.stringify(geom)
  const ewkt = geomStr.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
  if (ewkt) return { lon: parseFloat(ewkt[1]), lat: parseFloat(ewkt[2]) }
  if (typeof geom === 'object' && geom?.coordinates)
    return { lon: geom.coordinates[0], lat: geom.coordinates[1] }
  return null
}
