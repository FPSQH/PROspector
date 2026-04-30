export interface CommuneGeo {
  code: string
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
  type: string
  x: number
  y: number
  housenumber?: string
  street?: string
  postcode: string
  city: string
  citycode: string
  context: string
}

export async function searchCommunes(query: string): Promise<CommuneGeo[]> {
  if (query.length < 2) return []
  const isCodePostal = /^\d+$/.test(query)
  const param = isCodePostal
    ? `codePostal=${query}`
    : `nom=${encodeURIComponent(query)}&limit=10`
  const res = await fetch(
    `https://geo.api.gouv.fr/communes?${param}&fields=nom,code,codesPostaux,codeDepartement,codeRegion,population&boost=population`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  return res.json()
}

export async function getCommuneByInsee(codeInsee: string): Promise<CommuneGeo | null> {
  const res = await fetch(
    `https://geo.api.gouv.fr/communes/${codeInsee}?fields=nom,code,codesPostaux,codeDepartement,codeRegion,population`
  )
  if (!res.ok) return null
  return res.json()
}

export async function fetchAdressesByCommune(codeInsee: string): Promise<AdresseBAN[]> {
  const allAdresses: AdresseBAN[] = []
  const seen = new Set<string>()

  const queries = ['rue', 'avenue', 'chemin', 'impasse', 'voie', 'route', 'place', 'allee', 'hameau', 'lieu']

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&citycode=${codeInsee}&limit=50&type=housenumber`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const features = data.features ?? []
      for (const f of features) {
        const id = f.properties.id
        if (seen.has(id)) continue
        seen.add(id)
        allAdresses.push({
          id,
          label: f.properties.label,
          score: f.properties.score,
          type: f.properties.type,
          housenumber: f.properties.housenumber,
          street: f.properties.street,
          postcode: f.properties.postcode,
          city: f.properties.city,
          citycode: f.properties.citycode,
          context: f.properties.context,
          x: f.geometry.coordinates[0],
          y: f.geometry.coordinates[1],
        })
      }
    } catch {
      continue
    }
  }

  return allAdresses
}

export async function geocodeAdresse(adresse: string, postcode?: string): Promise<{ lat: number; lon: number } | null> {
  const url = new URL('https://api-adresse.data.gouv.fr/search/')
  url.searchParams.set('q', adresse)
  url.searchParams.set('limit', '1')
  if (postcode) url.searchParams.set('postcode', postcode)

  const res = await fetch(url.toString())
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  return {
    lon: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
  }
}
