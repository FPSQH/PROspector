// ============================================================
// Client DVF – API tabulaire data.gouv.fr
//
// Dataset : DVF géolocalisé (DGFiP / Etalab)
// Doc     : https://tabular-api.data.gouv.fr/api/doc
//
// Le resource_id correspond au fichier CSV du dataset DVF géolocalisé
// sur data.gouv.fr. À mettre à jour via DVF_RESOURCE_ID si le dataset
// est republié avec un nouvel identifiant.
// ============================================================

export const DVF_BASE = 'https://tabular-api.data.gouv.fr/api'

// Resource ID du dataset DVF géolocalisé (toutes années, toute France)
// Source : https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/
export const DVF_RESOURCE_ID =
  process.env.DVF_RESOURCE_ID ?? '90a98de0-f562-4328-aa16-fe0dd1dca60f'

export const DVF_PAGE_SIZE = 1000

// Colonnes à récupérer (subset pertinent pour PROspector)
export const DVF_COLUMNS = [
  'id_mutation',
  'date_mutation',
  'nature_mutation',
  'valeur_fonciere',
  'adresse_numero',
  'adresse_suffixe',
  'adresse_nom_voie',
  'code_postal',
  'code_commune',
  'nom_commune',
  'code_departement',
  'id_parcelle',
  'type_local',
  'surface_reelle_bati',
  'nombre_pieces_principales',
  'surface_terrain',
  'longitude',
  'latitude',
].join(',')

export interface DvfRow {
  id_mutation: string
  date_mutation: string
  nature_mutation: string | null
  valeur_fonciere: string | null
  adresse_numero: string | null
  adresse_suffixe: string | null
  adresse_nom_voie: string | null
  code_postal: string | null
  code_commune: string
  nom_commune: string | null
  code_departement: string | null
  id_parcelle: string | null
  type_local: string | null
  surface_reelle_bati: string | null
  nombre_pieces_principales: string | null
  surface_terrain: string | null
  longitude: string | null
  latitude: string | null
}

export interface DvfPageResult {
  rows: DvfRow[]
  nextPage: number | null
  totalRows: number | null
}

// Récupère une page de mutations DVF filtrée par code_commune
export async function fetchDvfPage(
  codeCommune: string,
  page = 1
): Promise<DvfPageResult> {
  const url = new URL(`${DVF_BASE}/resources/${DVF_RESOURCE_ID}/data/`)
  url.searchParams.set('code_commune__exact', codeCommune)
  url.searchParams.set('page', String(page))
  url.searchParams.set('page_size', String(DVF_PAGE_SIZE))
  // Ne pas passer 'columns' — non garanti supporté par la tabular-api

  const resp = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })

  if (!resp.ok) {
    // Récupérer le corps de l'erreur pour diagnostic
    let detail = ''
    try { detail = await resp.text() } catch (_) {}
    throw new Error(`DVF API HTTP ${resp.status} pour commune ${codeCommune} — ${detail.slice(0, 300)}`)
  }

  const data = await resp.json()

  // La tabular-api renvoie { data: [...], meta: { page, page_size, total } }
  // Certaines versions renvoient { results: [...], next, count } (format DRF)
  const rows: DvfRow[] = data.data ?? data.results ?? []
  const meta = data.meta ?? {}
  const total: number | null = meta.total ?? data.count ?? null
  const currentPage: number = meta.page ?? page
  const pageSize: number = meta.page_size ?? DVF_PAGE_SIZE

  let nextPage: number | null = null
  if (data.next) {
    // Format DRF : URL next fournie directement
    nextPage = currentPage + 1
  } else if (total !== null && currentPage * pageSize < total) {
    nextPage = currentPage + 1
  }

  return { rows, nextPage, totalRows: total }
}

// Convertit une ligne brute DVF en objet typé pour l'upsert Supabase
export function normalizeDvfRow(r: DvfRow) {
  const parseNum = (v: string | null) =>
    v !== null && v !== '' ? parseFloat(v.replace(',', '.')) : null
  const parseInt2 = (v: string | null) =>
    v !== null && v !== '' ? parseInt(v, 10) : null

  return {
    id_mutation:               r.id_mutation?.trim() || null,
    date_mutation:             r.date_mutation?.trim() || null,
    nature_mutation:           r.nature_mutation?.trim() || null,
    valeur_fonciere:           parseNum(r.valeur_fonciere),
    adresse_numero:            r.adresse_numero?.trim() || null,
    adresse_suffixe:           r.adresse_suffixe?.trim() || null,
    adresse_nom_voie:          r.adresse_nom_voie?.trim() || null,
    code_postal:               r.code_postal?.trim() || null,
    code_commune:              r.code_commune?.trim() || '',
    nom_commune:               r.nom_commune?.trim() || null,
    code_departement:          r.code_departement?.trim() || null,
    id_parcelle:               r.id_parcelle?.trim() || null,
    type_local:                r.type_local?.trim() || null,
    surface_reelle_bati:       parseNum(r.surface_reelle_bati),
    nombre_pieces_principales: parseInt2(r.nombre_pieces_principales),
    surface_terrain:           parseNum(r.surface_terrain),
    longitude:                 parseNum(r.longitude),
    latitude:                  parseNum(r.latitude),
  }
}
