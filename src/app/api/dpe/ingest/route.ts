// src/app/api/dpe/ingest/route.ts
//
// POST /api/dpe/ingest
//
// Ingestion DPE ADEME avec mode INCRÉMENTAL automatique.
// - 1ère ingestion : récupère tous les DPE des 2 dernières années
// - Ingestions suivantes : utilise date_derniere_modification_dpe depuis
//   la derniere_ingest_dpe de la commune (DataFair paramètre documenté)
// - Met à jour communes.derniere_ingest_dpe après chaque succès
//
// Body : { code_postal, code_insee, after?, force_full? }
// Retourne : { nb_inserted, nb_raw, total, after, has_more, mode }

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'
import { normCP, toIsoDate, buildAdresseBrute } from '@/lib/dpe/normalize'
import { geocodeAdresse } from '@/lib/ban'

const DPE_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines'

// Champs sélectionnés — numero_dpe remplace identifiant_dpe (déprécié v3)
const DPE_FIELDS = [
  'numero_dpe',
  'adresse_ban',
  'numero_voie_ban',
  'nom_rue_ban',
  'code_postal_ban',
  'code_postal_brut',
  'nom_commune_ban',
  'code_insee_ban',
  'etiquette_dpe',
  'etiquette_ges',
  'annee_construction',
  'surface_habitable_logement',
  'coordonnee_cartographique_x_ban',
  'coordonnee_cartographique_y_ban',
  'date_etablissement_dpe',
  'date_derniere_modification_dpe',
  'type_batiment',
  'conso_5_usages_par_m2_ep',
  'cout_total_5_usages',
  'type_energie_principale_chauffage',
  'emission_ges_5_usages_par_m2',
].join(',')

// Conversion Lambert 93 → WGS84 (ADEME fournit des coordonnées Lambert 93)
function lambert93ToWgs84(x: number, y: number): {lat: number, lon: number} | null {
  const n = 0.7256077650, F = 11754255.426
  const e = 0.0818191910, lc = 0.04079234433
  const R = F * Math.exp(-n * Math.log(Math.sqrt(x * x + (y - 6467437.664) * (y - 6467437.664))))
  const g = Math.atan(x / (6467437.664 - y))
  let lon = g / n + lc
  let lat = 2 * Math.atan(Math.exp(Math.log(R / F) / n)) - Math.PI / 2
  for (let i = 0; i < 5; i++) {
    const s = e * Math.sin(lat)
    lat = 2 * Math.atan(Math.pow((1 + s) / (1 - s), e / 2) * Math.exp(Math.log(R / F) / n)) - Math.PI / 2
  }
  lon = lon * 180 / Math.PI
  lat = lat * 180 / Math.PI
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) return null
  return { lat, lon }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  const body = await req.json().catch(() => null)
  if (!body?.code_postal || !body?.code_insee) {
    return NextResponse.json({ error: 'code_postal et code_insee requis' }, { status: 400 })
  }

  const { code_postal, code_insee, force_full = false } = body
  const afterCursor: string | null = body.after ?? null
  const size = 500 // DataFair recommande 500 max
  const cpTarget = normCP(code_postal)

  // ── Mode incrémental : lire derniere_ingest_dpe de la commune ─────────────
  let filterDate: string | null = null
  let mode = 'full'

  if (!force_full && !afterCursor) {
    const { data: commune } = await adminDb
      .from('communes')
      .select('derniere_ingest_dpe')
      .eq('code_insee', code_insee)
      .maybeSingle()

    if (commune?.derniere_ingest_dpe) {
      // Mode incrémental : DPE modifiés depuis la dernière ingestion
      filterDate = new Date(commune.derniere_ingest_dpe).toISOString().slice(0, 10)
      mode = 'incremental'
    } else {
      // Mode complet : 2 dernières années
      filterDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      mode = 'full'
    }
  } else if (afterCursor) {
    mode = 'pagination'
  }

  try {
    const params = new URLSearchParams({ size: size.toString(), select: DPE_FIELDS })

    // Le filtre qs est TOUJOURS appliqué, y compris avec afterCursor (pagination)
    if (mode === 'incremental' && filterDate) {
      params.set('qs', `(code_insee_ban:"${code_insee}") AND date_derniere_modification_dpe:[${filterDate} TO *]`)
    } else {
      // Complet ou pagination : filtre par code_insee + date_etablissement
      const qsParts = [`code_insee_ban:"${code_insee}"`]
      if (filterDate) qsParts.push(`date_etablissement_dpe:[${filterDate} TO *]`)
      params.set('qs', qsParts.join(' AND '))
    }

    params.set('sort', '-date_etablissement_dpe')
    if (afterCursor) params.set('after', afterCursor)

    const url = DPE_BASE + '?' + params
    const resp = await fetch(url)
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      return NextResponse.json({ error: `API ADEME: HTTP ${resp.status} — ${errText.slice(0,200)}` }, { status: 502 })
    }

    const data = await resp.json()
    const rawRows: any[] = data.results || []
    const total = data.total || 0
    // DataFair retourne "next" (URL) et non "after" directement
    // Extraire le paramètre after= depuis l'URL next
    let nextAfterCursor: string | null = null
    if (data.next) {
      try {
        const nextUrl = new URL(data.next)
        nextAfterCursor = nextUrl.searchParams.get('after')
      } catch (_) {}
    }

    // ── Traitement des lignes ─────────────────────────────────────────────────
    const rows = []
    let geocodingCount = 0
    const GEOCODING_LIMIT = 20

    for (const r of rawRows) {
      const idDpe = (r.numero_dpe || '').trim()
      if (!idDpe) continue

      // Coordonnées : Lambert 93 → WGS84 (ADEME)
      let lat: number | null = null
      let lon: number | null = null

      const x = parseFloat(r.coordonnee_cartographique_x_ban)
      const y = parseFloat(r.coordonnee_cartographique_y_ban)
      if (!isNaN(x) && !isNaN(y) && x !== 0 && y !== 0) {
        const wgs = lambert93ToWgs84(x, y)
        if (wgs) { lat = wgs.lat; lon = wgs.lon }
      }

      // Géocodage BAN si pas de coordonnées (limité pour le timeout)
      if ((lat === null || lon === null) && geocodingCount < GEOCODING_LIMIT) {
        const addrStr = r.adresse_ban || buildAdresseBrute(r)
        if (addrStr) {
          geocodingCount++
          const cp = normCP(r.code_postal_ban || r.code_postal_brut) || cpTarget
          const banCoords = await geocodeAdresse(addrStr, cp).catch(() => null)
          if (banCoords) { lat = banCoords.lat; lon = banCoords.lon }
        }
      }

      // Adresse reconstituée
      const adresseB = r.adresse_ban
        || (r.numero_voie_ban && r.nom_rue_ban ? (r.numero_voie_ban + ' ' + r.nom_rue_ban).trim() : null)
        || buildAdresseBrute(r)

      // Filtre côté client : vérifier que le code INSEE correspond vraiment
      const inseeOk = (r.code_insee_ban || '').toString() === code_insee.toString()
      const cpOk    = normCP(r.code_postal_ban) === cpTarget || normCP(r.code_postal_brut) === cpTarget
      if (!inseeOk && !cpOk) continue

      rows.push({
        numero_dpe:         idDpe,
        code_insee:         code_insee,
        code_postal:        normCP(r.code_postal_ban || r.code_postal_brut) || cpTarget,
        adresse_brute:      adresseB,
        type_batiment:      (r.type_batiment || '').toLowerCase().trim() || null,
        surface_habitable:  r.surface_habitable_logement ?? null,
        annee_construction: r.annee_construction ?? null,
        etiquette_dpe:      (r.etiquette_dpe || '').charAt(0).toUpperCase() || null,
        etiquette_ges:      (r.etiquette_ges || '').charAt(0).toUpperCase() || null,
        conso_ep_m2:        r.conso_5_usages_par_m2_ep != null ? Number(r.conso_5_usages_par_m2_ep) : null,
        cout_annuel:        r.cout_total_5_usages != null ? Number(r.cout_total_5_usages) : null,
        energie_principale: r.type_energie_principale_chauffage ?? null,
        ges_m2:             r.emission_ges_5_usages_par_m2 != null ? Number(r.emission_ges_5_usages_par_m2) : null,
        date_etablissement: toIsoDate(r.date_etablissement_dpe),
        geom:               (lat !== null && lon !== null) ? `SRID=4326;POINT(${lon} ${lat})` : null,
        match_confiance:    'non_matche',
      })
    }

    // ── Upsert en base ────────────────────────────────────────────────────────
    let nbInserted = 0
    for (const batch of chunk(rows, 100)) {
      const { error } = await adminDb
        .from('dpe_logement')
        .upsert(batch, { onConflict: 'numero_dpe', ignoreDuplicates: false })
      if (!error) nbInserted += batch.length
    }

    // ── Mise à jour derniere_ingest_dpe si c'est la dernière page ─────────────
    const hasMore = (nextAfterCursor !== null) || (rawRows.length >= size && rawRows.length < total)
    if (!hasMore && nbInserted > 0) {
      await adminDb
        .from('communes')
        .update({ derniere_ingest_dpe: new Date().toISOString() })
        .eq('code_insee', code_insee)

      // Propager latest_dpe_date vers adresses
      try { await adminDb.rpc('propagate_dpe_dates', { p_code_insee: code_insee }) } catch (_) {}
    }

    return NextResponse.json({
      nb_inserted: nbInserted,
      nb_raw:      rawRows.length,
      total,
      after:       hasMore ? nextAfterCursor : null,
      has_more:    hasMore,
      mode,
    })

  } catch (err: any) {
    console.error('[DPE] Erreur ingestion:', err)
    return NextResponse.json({ error: err.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}
