import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/zones/chevauchements
// Détecte les chevauchements entre toutes les zones du commercial connecté
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data, error } = await supabase.rpc('detect_chevauchements', {
    p_commercial_id: user.id,
  })

  if (error) {
    console.error('[chevauchements]', error)
    return NextResponse.json({ chevauchements: [] })
  }

  return NextResponse.json({ chevauchements: data ?? [] })
}
