import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const code_insee = searchParams.get('code_insee')
  if (!code_insee) return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })

  const { data: commune } = await supabase
    .from('communes')
    .select('id, nom, chargee_at')
    .eq('commercial_id', user.id)
    .eq('code_insee', code_insee)
    .single()

  if (!commune) return NextResponse.json({ error: 'Commune non trouvée' }, { status: 404 })

  // Compter les adresses chargées
  const { count } = await supabase
    .from('adresses')
    .select('id', { count: 'exact', head: true })
    .eq('code_insee', code_insee)

  return NextResponse.json({
    chargee: !!commune.chargee_at,
    chargee_at: commune.chargee_at,
    nb_adresses: count ?? 0,
  })
}
