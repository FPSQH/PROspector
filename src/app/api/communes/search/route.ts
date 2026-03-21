import { createClient } from '@/lib/supabase/server'
import { searchCommunes } from '@/lib/ban'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) return NextResponse.json([])

  const communes = await searchCommunes(q)

  // Filtrer et formater pour l'UI
  const results = communes.slice(0, 8).map(c => ({
    code_insee: c.code,
    nom: c.nom,
    code_postal: c.codesPostaux?.[0] ?? '',
    departement: c.codeDepartement,
    population: c.population,
    label: `${c.nom} (${c.codesPostaux?.join(', ') ?? c.codeDepartement})`,
  }))

  return NextResponse.json(results)
}
