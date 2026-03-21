import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) return NextResponse.json([])

  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,code,codesPostaux,codeDepartement,population&boost=population&limit=8`,
      { next: { revalidate: 3600 } }
    )
    const communes = await res.json()

    const results = communes.slice(0, 8).map((c: any) => ({
      code_insee: c.code,
      nom: c.nom,
      code_postal: c.codesPostaux?.[0] ?? '',
      departement: c.codeDepartement,
      population: c.population,
      label: `${c.nom} (${c.codesPostaux?.join(', ') ?? c.codeDepartement})`,
    }))

    return NextResponse.json(results)
  } catch {
    return NextResponse.json([])
  }
}
