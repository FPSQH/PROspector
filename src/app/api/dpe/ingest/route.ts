// src/app/api/dpe/ingest/route.ts
//
// POST /api/dpe/ingest
//
// Ingère une page de DPE ADEME selon les spécifications DataFair V2.
// Utilise identifiant_dpe comme pivot, code_insee_commune_actualise pour le filtrage,
// et une pagination par start/offset pour l'exhaustivité.
//
// Body : { code_postal, code_insee, start? }
// Retourne : { nb_inserted, nb_raw, total, next_start, has_more }

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'
import { normCP, toIsoDate, buildAdresseBrute } from '@/lib/dpe/normalize'
import { geocodeAdresse } from '@/lib/ban'

const DPE_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines'

const DPE_FIELDS = [
  'identifiant_dpe',
  'adresse_brut',
  'code_postal_brut',
  'nom_commune_brut',
  'etiquette_dpe',
  'etiquette_ges',
  'annee_construction',
  'surface_habitable_logement',
  'latitude',
  'longitude',
  'date_etablissement_dpe',
  'type_batiment',
  'conso_5_usages_par_m2_ep',
  'cout_total_5_usages',
  'type_energie_principale_chauffage',
  'emission_ges_5_usages_par_m2',
].join(',')

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.code_postal || !body?.code_insee) {
    return NextResponse.json({ error: 'code_postal et code_insee requis' }, { status: 400 })
  }

  const { code_postal, code_insee } = body
  const start = parseInt(body.start ?? '0')
  const size  = 3000
  const cpTarget = normCP(code_postal)

  const sinceDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  try {
    const params = new URLSearchParams({
      size:   size.toString(),
      start:  start.toString(),
      select: DPE_FIELDS,
      qs:     `code_insee_commune_actualise:"${code_insee}" AND date_etablissement_dpe:[${sinceDate} TO *]`,
      sort:   'date_etablissement_dpe:desc',
    })

    const url = DPE_BASE + '?' + params
    const resp = await fetch(url)

    if (!resp.ok) return NextResponse.json({ error: `API ADEME: HTTP ${resp.status}` }, { status: 502 })

    const data = await resp.json()
    const rawRows: any[] = data.results || []
    const total = data.total || 0

    const rows = []
    let geocodingCount = 0
    const GEOCODING_LIMIT = 50 // Limite pour éviter les timeouts Vercel 10s

    for (const r of rawRows) {
      const idDpe = (r.identifiant_dpe || '').trim()
      if (!idDpe) continue

      let lat = parseFloat(r.latitude)
      let lon = parseFloat(r.longitude)
      const addrStr = r.adresse_brut || buildAdresseBrute(r)

      if ((isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) && addrStr && geocodingCount < GEOCODING_LIMIT) {
        geocodingCount++
        const cp = normCP(r.code_postal_brut) || cpTarget
        // Appel BAN avec contexte (Spec V2)
        const banCoords = await geocodeAdresse(`${addrStr} ${cp}`).catch(() => null)
        if (banCoords) {
          lat = banCoords.lat
          lon = banCoords.lon
        }
      }

      rows.push({
        numero_dpe:         idDpe,
        code_insee:         code_insee,
        code_postal:        normCP(r.code_postal_brut) || cpTarget,
        adresse_brute:      addrStr,
        type_batiment:      (r.type_batiment || '').toLowerCase().trim() || null,
        surface_habitable:  r.surface_habitable_logement ?? null,
        annee_construction: r.annee_construction ?? null,
        nombre_appartement: r.nombre_appartement ?? null,
        etiquette_dpe:      (r.etiquette_dpe || '').charAt(0).toUpperCase() || null,
        etiquette_ges:      (r.etiquette_ges || '').charAt(0).toUpperCase() || null,
        conso_ep_m2:        r.conso_5_usages_par_m2_ep != null ? Number(r.conso_5_usages_par_m2_ep) : null,
        cout_annuel:        r.cout_total_5_usages != null ? Number(r.cout_total_5_usages) : null,
        energie_principale: r.type_energie_principale_chauffage ?? null,
        ges_m2:             r.emission_ges_5_usages_par_m2 != null ? Number(r.emission_ges_5_usages_par_m2) : null,
        date_etablissement: toIsoDate(r.date_etablissement_dpe),
        geom:               (!isNaN(lat) && !isNaN(lon)) ? `SRID=4326;POINT(${lon} ${lat})` : null,
        match_confiance:    'non_matche',
      })
    }

    let nbInserted = 0
    for (const batch of chunk(rows, 100)) {
      const { error } = await supabase.from('dpe_logement').upsert(batch, { onConflict: 'numero_dpe', ignoreDuplicates: false })
      if (!error) nbInserted += batch.length
    }

    const nextStart = start + size
    const hasMore = nextStart < total

    return NextResponse.json({
      nb_inserted: nbInserted,
      nb_raw:      rawRows.length,
      total:       total,
      next_start:  hasMore ? nextStart : null,
      has_more:    hasMore,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
