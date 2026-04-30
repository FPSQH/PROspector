// src/app/api/dpe/ingest/route.ts
//
// POST /api/dpe/ingest
//
// Ingère une page de DPE ADEME optimisée pour l'exhaustivité (selon spec DataFair).
//
// Body : { code_postal, code_insee, after? }
// Retourne : { nb_inserted, nb_filtered, nb_raw, after, has_more }

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'
import { normCP, toIsoDate, buildAdresseBrute } from '@/lib/dpe/normalize'
import { geocodeAdresse } from '@/lib/ban'

const DPE_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines'

// Sélection des 10 champs essentiels recommandés pour optimiser la charge réseau
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
  'date_etablissement_dpe', // Requis pour le tri et le filtrage temporel
  'type_batiment',          // Requis pour la qualification terrain
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
  const after: string | null = body.after ?? null
  const cpTarget = normCP(code_postal)

  // Filtrage temporel : depuis les 2 dernières années pour garantir l'exhaustivité demandée
  const sinceDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  try {
    // ── Requête ADEME optimisée (Taille 3000 : compromis entre spec 10k et timeout Vercel 10s)
    const params = new URLSearchParams({
      size:   '3000',
      select: DPE_FIELDS,
      // Utilisation du code_insee_commune_actualise (Recommandation spec)
      qs:     `code_insee_commune_actualise:"${code_insee}" AND date_etablissement_dpe:[${sinceDate} TO *]`,
      sort:   '-date_etablissement_dpe',
    })

    const url = DPE_BASE + '?' + params + (after ? '&after=' + encodeURIComponent(after) : '')
    const resp = await fetch(url)

    if (!resp.ok) {
      return NextResponse.json({ error: `API ADEME: HTTP ${resp.status}` }, { status: 502 })
    }

    const data = await resp.json()
    const rawRows: any[] = data.results || []

    // ── Transformation & Fallback Géocodage BAN ───────────────────────────
    const rows = []

    for (const r of rawRows) {
      // Priorité à identifiant_dpe (spec), fallback sur numero_dpe si absent
      const numeroDpe = (r.identifiant_dpe || r.numero_dpe || '').trim()
      if (!numeroDpe) continue

      let lat = parseFloat(r.latitude)
      let lon = parseFloat(r.longitude)
      const addrStr = r.adresse_brut || buildAdresseBrute(r)

      // Fallback BAN : Si les coordonnées ADEME sont absentes, nulles ou à 0
      if ((isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) && addrStr) {
        // Limitation : géocodage séquentiel peut être lent sur 3000 lignes
        // On ne le fait que si nécessaire pour rester sous les 10s
        const banCoords = await geocodeAdresse(`${addrStr} ${r.code_postal_brut || cpTarget}`).catch(() => null)
        if (banCoords) {
          lat = banCoords.lat
          lon = banCoords.lon
        }
      }

      const dateEtab = toIsoDate(r.date_etablissement_dpe)
      const etDpe = (r.etiquette_dpe || '').charAt(0).toUpperCase()
      const etGes = (r.etiquette_ges || '').charAt(0).toUpperCase()

      rows.push({
        numero_dpe:         numeroDpe,
        code_insee:         code_insee,
        code_postal:        normCP(r.code_postal_brut) || cpTarget,
        adresse_brute:      addrStr,
        type_batiment:      (r.type_batiment || '').toLowerCase().trim() || null,
        surface_habitable:  r.surface_habitable_logement ?? null,
        annee_construction: r.annee_construction ?? null,
        etiquette_dpe:      etDpe || null,
        etiquette_ges:      etGes || null,
        conso_ep_m2:        r.conso_5_usages_par_m2_ep      != null ? Number(r.conso_5_usages_par_m2_ep)      : null,
        cout_annuel:        r.cout_total_5_usages            != null ? Number(r.cout_total_5_usages)            : null,
        energie_principale: r.type_energie_principale_chauffage ?? null,
        ges_m2:             r.emission_ges_5_usages_par_m2  != null ? Number(r.emission_ges_5_usages_par_m2)  : null,
        date_etablissement: dateEtab,
        geom:               (!isNaN(lat) && !isNaN(lon))
          ? `SRID=4326;POINT(${lon} ${lat})`
          : null,
        match_confiance:    'non_matche',
      })
    }

    // ── Upsert dans dpe_logement (batch de 100) ───────────────────────────
    let nbInserted = 0
    for (const batch of chunk(rows, 100)) {
      const { error } = await supabase
        .from('dpe_logement')
        .upsert(batch, { onConflict: 'numero_dpe', ignoreDuplicates: false })

      if (error) console.error('[DPE] Erreur upsert batch:', error.message)
      else nbInserted += batch.length
    }

    // ── Pagination logic ──────────────────────────────────────────────────
    // La spec recommande start/total, mais l'API Koumoul renvoie aussi 'after'
    // On conserve 'after' car plus performant sur de très gros datasets
    const hasMore = rawRows.length >= 3000 && !!data.after

    return NextResponse.json({
      nb_inserted: nbInserted,
      nb_raw:      rawRows.length,
      total:       data.total, // Retourné pour information au client (progression)
      after:       hasMore ? data.after : null,
      has_more:    hasMore,
    })

  } catch (err: any) {
    console.error('[DPE] Erreur ingestion:', err)
    return NextResponse.json({ error: err.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}
