import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) return NextResponse.json({ communes: [] })

  try {
    const isCodePostal = /^\d+$/.test(q)

    let url: string
    if (isCodePostal) {
      url = `https://geo.api.gouv.fr/communes?codePostal=${q}&fields=nom,code,codesPostaux,codeDepartement,population&limit=50`
    } else {
      url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,code,codesPostaux,codeDepartement,population&boost=population&limit=30`
    }

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) throw new Error('API geo error')

    const data = await res.json()

    // L'API retourne codeDepartement (pas departement)
    const communes = (data as any[]).map((c) => ({
      code_insee:  c.code,
      nom:         c.nom,
      code_postal: c.codesPostaux?.[0] ?? '',
      departement: c.codeDepartement ?? '',
      population:  c.population ?? 0,
    }))

    if (!isCodePostal) {
      communes.sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    } else {
      communes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    }

    return NextResponse.json({ communes, is_code_postal: isCodePostal })
  } catch {
    return NextResponse.json({ communes: [], error: 'Erreur recherche' })
  }
}
