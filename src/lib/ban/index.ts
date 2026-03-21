export async function fetchAdressesByCommune(codeInsee: string): Promise<AdresseBAN[]> {
  const allAdresses: AdresseBAN[] = []
  const seen = new Set<string>()

  // Lettres courantes pour balayer les adresses
  const queries = ['rue', 'avenue', 'chemin', 'impasse', 'voie', 'route', 'place', 'allée', 'hameau', 'lieu']

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
  
  // L'API BAN limite à 200 par requête — on fait plusieurs appels
  const types = ['housenumber', 'street']
  
  for (const type of types) {
    let page = 0
    while (true) {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=a&citycode=${codeInsee}&limit=200&type=${type}&offset=${page * 200}`,
        { signal: AbortSignal.timeout(30000) }
      )
      if (!res.ok) break
      
      const data = await res.json()
      const features = data.features ?? []
      
      const batch = features.map((f: any) => ({
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
        x: f.geometry.coordinates[0],
        y: f.geometry.coordinates[1],
      }))
      
      allAdresses.push(...batch)
      
      // Si moins de 200 résultats, on a tout
      if (features.length < 200) break
      page++
      
      // Sécurité : max 10 pages par type
      if (page >= 10) break
    }
  }
  
  // Dédupliquer par id
  const seen = new Set<string>()
  return allAdresses.filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
}
