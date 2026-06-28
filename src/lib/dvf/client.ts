// ============================================================
// Client DVF – fichiers CSV statiques Etalab
//
// Source : https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/
// Les CSV sont servis par commune :
//   https://files.data.gouv.fr/geo-dvf/latest/csv/{dept}/communes/{code_commune}.csv
//
// Pas de tabular-api (le fichier unique 3.5Go est trop lourd).
// Un fichier par commune = requêtes ciblées et rapides.
// ============================================================

export const DVF_GEO_BASE = 'https://files.data.gouv.fr/geo-dvf/latest/csv'

// Extrait le code département depuis le code INSEE commune
export function getDeptCode(codeCommune: string): string {
  // DOM-TOM : 971, 972, 973, 974, 976
  if (codeCommune.startsWith('97')) return codeCommune.slice(0, 3)
  return codeCommune.slice(0, 2)
}

export function getDvfCommuneUrl(codeCommune: string): string {
  return `${DVF_GEO_BASE}/${getDeptCode(codeCommune)}/communes/${codeCommune}.csv`
}

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

// Parse un CSV texte en tableau de DvfRow
// Le CSV Etalab utilise la virgule comme séparateur, UTF-8, première ligne = headers
function parseCsv(text: string): DvfRow[] {
  const lines = text.split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

  const rows: DvfRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Découpage simple : les valeurs DVF ne contiennent pas de virgules dans les chaînes
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, '') || null)

    const obj: Record<string, string | null> = {}
    headers.forEach((h, idx) => { obj[h] = values[idx] ?? null })

    if (!obj['id_mutation'] || !obj['date_mutation']) continue

    rows.push({
      id_mutation:               obj['id_mutation'] ?? '',
      date_mutation:             obj['date_mutation'] ?? '',
      nature_mutation:           obj['nature_mutation'],
      valeur_fonciere:           obj['valeur_fonciere'],
      adresse_numero:            obj['adresse_numero'],
      adresse_suffixe:           obj['adresse_suffixe'],
      adresse_nom_voie:          obj['adresse_nom_voie'],
      code_postal:               obj['code_postal'],
      code_commune:              obj['code_commune'] ?? '',
      nom_commune:               obj['nom_commune'],
      code_departement:          obj['code_departement'],
      id_parcelle:               obj['id_parcelle'],
      type_local:                obj['type_local'],
      surface_reelle_bati:       obj['surface_reelle_bati'],
      nombre_pieces_principales: obj['nombre_pieces_principales'],
      surface_terrain:           obj['surface_terrain'],
      longitude:                 obj['longitude'],
      latitude:                  obj['latitude'],
    })
  }
  return rows
}

// Télécharge et parse le CSV DVF pour une commune
export async function fetchDvfCommune(codeCommune: string): Promise<{ rows: DvfRow[]; totalRows: number }> {
  const url = getDvfCommuneUrl(codeCommune)

  const resp = await fetch(url, {
    headers: { Accept: 'text/csv,text/plain,*/*' },
    signal: AbortSignal.timeout(60_000), // fichiers potentiellement lourds
  })

  if (resp.status === 404) {
    // Commune sans mutations enregistrées — c'est normal pour les petites communes
    return { rows: [], totalRows: 0 }
  }

  if (!resp.ok) {
    throw new Error(`DVF HTTP ${resp.status} pour commune ${codeCommune} (${url})`)
  }

  const text = await resp.text()
  const rows = parseCsv(text)
  return { rows, totalRows: rows.length }
}

// Convertit une ligne brute DVF en objet typé pour l'upsert Supabase
export function normalizeDvfRow(r: DvfRow) {
  const parseNum = (v: string | null) =>
    v !== null && v !== '' ? parseFloat(v) : null
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
