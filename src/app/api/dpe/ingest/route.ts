// src/app/api/dpe/ingest/route.ts
//
// POST /api/dpe/ingest
//
// Ingère UNE page de DPE ADEME (500 résultats max) pour un code postal.
// Appelée en boucle par le client jusqu'à has_more === false.
// Chaque appel tient dans le timeout Vercel Hobby de 10 secondes.
//
// Body : { code_postal, code_insee, after? }
// Retourne : { nb_inserted, nb_filtered, nb_raw, after, has_more }

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'
import { lambert93ToWgs84 } from '@/lib/geo/lambert93'
import { normCP, toIsoDate, buildAdresseBrute } from '@/lib/dpe/normalize'

const DPE_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines'

const DPE_FIELDS = [
  'numero_dpe',
  'date_etablissement_dpe',
  'type_batiment',
  'etiquette_dpe',
  'etiquette_ges',
  'surface_habitable_logement',
  'annee_construction',
  'nombre_appartement',
  'adresse_ban',
  'numero_voie_ban',
  'nom_rue_ban',
  'code_postal_ban',
  'code_postal_brut',
  'code_insee_ban',
  'nom_commune_ban',
  'coordonnee_cartographique_x_ban',
  'coordonnee_cartographique_y_ban',
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

  try {
    // ── Requête ADEME (1 page de 500) ─────────────────────────────────────
    const params = new URLSearchParams({
      size:   '500',
      select: DPE_FIELDS,
      qs:     `code_postal_ban:"${cpTarget}" OR code_postal_brut:"${cpTarget}"`,
      sort:   '-date_etablissement_dpe',
    })

    const url = DPE_BASE + '?' + params + (after ? '&after=' + encodeURIComponent(after) : '')
    const resp = await fetch(url)

    if (!resp.ok) {
      return NextResponse.json(
        { error: `API ADEME: HTTP ${resp.status}` },
        { status: 502 }
      )
    }

    const data = await resp.json()
    const rawRows: any[] = data.results || []

    // ── Filtrage côté client (CP exact + code INSEE) ──────────────────────
    const filtered = rawRows.filter((r: any) => {
      const cpBan  = normCP(r.code_postal_ban)
      const cpBrut = normCP(r.code_postal_brut)
      if (cpBan !== cpTarget && cpBrut !== cpTarget) return false
      // Filtre par commune si code_insee renseigné dans le DPE
      const inseeBan = (r.code_insee_ban || '').trim()
      if (inseeBan && inseeBan !== code_insee) return false
      return true
    })

    // ── Transformation → format dpe_logement ──────────────────────────────
    const rows = filtered
      .map((r: any) => {
        const numeroDpe = (r.numero_dpe || '').trim()
        if (!numeroDpe) return null

        const x = parseFloat(r.coordonnee_cartographique_x_ban)
        const y = parseFloat(r.coordonnee_cartographique_y_ban)
        const wgs = (!isNaN(x) && !isNaN(y)) ? lambert93ToWgs84(x, y) : null
        const dateEtab = toIsoDate(r.date_etablissement_dpe)
        const etDpe = (r.etiquette_dpe || '').charAt(0).toUpperCase()
        const etGes = (r.etiquette_ges || '').charAt(0).toUpperCase()

        return {
          numero_dpe:         numeroDpe,
          code_insee:         code_insee,
          code_postal:        cpTarget,
          adresse_brute:      buildAdresseBrute(r),
          type_batiment:      (r.type_batiment || '').toLowerCase().trim() || null,
          surface_habitable:  r.surface_habitable_logement ?? null,
          annee_construction: r.annee_construction ?? null,
          nombre_appartement: r.nombre_appartement ?? null,
          etiquette_dpe:      etDpe || null,
          etiquette_ges:      etGes || null,
          date_etablissement: dateEtab,
          geom:               wgs
            ? `SRID=4326;POINT(${wgs.lon} ${wgs.lat})`
            : null,
          match_confiance:    'non_matche',
        }
      })
      .filter(Boolean) as any[]

    // ── Upsert dans dpe_logement (batch de 200) ───────────────────────────
    let nbInserted = 0
    for (const batch of chunk(rows, 200)) {
      const { error } = await supabase
        .from('dpe_logement')
        .upsert(batch, { onConflict: 'numero_dpe', ignoreDuplicates: false })

      if (error) {
        console.error('[DPE] Erreur upsert batch:', error.message)
      } else {
        nbInserted += batch.length
      }
    }

    // ── Pagination ────────────────────────────────────────────────────────
    const hasMore = rawRows.length >= 500 && !!data.after

    console.log(
      `[DPE] ${code_insee} (${cpTarget}) — page: ${filtered.length} filtrés / ${rawRows.length} bruts, ` +
      `${nbInserted} insérés, hasMore=${hasMore}`
    )

    return NextResponse.json({
      nb_inserted: nbInserted,
      nb_filtered: filtered.length,
      nb_raw:      rawRows.length,
      after:       hasMore ? data.after : null,
      has_more:    hasMore,
    })

  } catch (err: any) {
    console.error('[DPE] Erreur ingestion:', err)
    return NextResponse.json({ error: err.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}
