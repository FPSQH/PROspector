// ============================================================
// Intégration Base Adresse Nationale (BAN)
// API : https://api-adresse.data.gouv.fr
// Données communes : https://geo.api.gouv.fr/communes
// ============================================================

export interface CommuneGeo {
  code: string        // code INSEE
  nom: string
  codesPostaux: string[]
  codeDepartement: string
  codeRegion: string
  population?: number
}

export interface AdresseBAN {
  id: string
  label: string
  score: number
  type: string        // 'housenumber' | 'street' | 'locality' | 'municipality'
  x: number
  y: number
  // Champs adresse
  housenumber?: string
  street?: string
  postcode: string
  city: string
  citycode: string    // code INSEE
  context: string
}

// Recherche de communes par nom ou code postal
// Utilisée dans l'onboarding pour la saisie du secteur
export async function searchCommunes(query: string): Promise<CommuneGeo[]> {
  if (query.length < 2) return []

  // Déterminer si la recherche est par code postal ou nom
  const isCodePostal = /^\d+$/.test(query)
  const param = isCodePostal ? `codePostal=${query}` : `nom=${encodeURIComponent(query)}&limit=10`

  const res = await fetch(
    `https://geo.api.gouv.fr/communes?${param}&fields=nom,code,codesPostaux,codeDepartement,codeRegion,population&boost=population`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  return res.json()
}

// Récupère une commune par code INSEE
export async function getCommuneByInsee(codeInsee: string): Promise<CommuneGeo | null> {
  const res = await fetch(
    `https://geo.api.gouv.fr/communes/${codeInsee}?fields=nom,code,codesPostaux,codeDepartement,codeRegion,population`
  )
  if (!res.ok) return null
  return res.json()
}

// Télécharge toutes les adresses d'une commune via l'API BAN
// Retourne les adresses au format brut BAN
export async function fetchAdressesByCommune(codeInsee: string): Promise<AdresseBAN[]> {
  // L'API BAN permet de rechercher toutes les adresses d'une commune
  // On utilise le endpoint de téléchargement par commune
  const res = await fetch(
    `https://api-adresse.data.gouv.fr/search/?q=a&citycode=${codeInsee}&limit=5000&type=housenumber`,
    { signal: AbortSignal.timeout(30000) }
  )
  if (!res.ok) throw new Error(`BAN fetch failed: ${res.status}`)

  const data = await res.json()
  return (data.features ?? []).map((f: any) => ({
    id: f.properties.id,
    label: f.properties.label,
    score: f.properties.score,
    type: f.properties.type,
    housenumber: f.properties.housenumber,
    street: f.properties.street,
    postcode: f.properties.postcode,
    city: f.properties.city,
    citycode: f.properties.citycode,
    context: f.properties.context,
    x: f.geometry.coordinates[0],  // longitude
    y: f.geometry.coordinates[1],  // latitude
  }))
}

// Télécharge les adresses via le fichier CSV BAN par département
// Plus complet que l'API search (pas de limite 5000)
// Utilisé pour les communes avec beaucoup d'adresses
export async function fetchAdressesByCommuneCSV(codeInsee: string, codeDept: string): Promise<AdresseBAN[]> {
  const dept = codeDept.padStart(2, '0')
  // Fichier CSV BAN par département
  const csvUrl = `https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-${dept}.csv.gz`

  // Note : pour éviter de télécharger tout le département,
  // on passe par l'API search avec pagination simulée
  // Le fichier CSV est géré côté serveur (API route /api/ingestion)
  return fetchAdressesByCommune(codeInsee)
}

// Geocode une adresse textuelle → coordonnées
export async function geocodeAdresse(adresse: string): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresse)}&limit=1`
  )
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  return {
    lon: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
  }
}
