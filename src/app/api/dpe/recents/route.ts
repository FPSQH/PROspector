// src/app/api/dpe/recents/route.ts
//
// GET /api/dpe/recents?code_insee=22362,22152,...
//
// Retourne les adresses ayant un DPE établi dans les 6 derniers mois
// pour les communes indiquées.
// Utilisé par la page Zones pour afficher le calque "DPE récents".

import { createClient } from '@/lib/supabase/server'
import { NextResponse }  from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const codeInseeParam = searchParams.get('code_insee') ?? ''
  const codeInsees = codeInseeParam.split(',').map(s => s.trim()).filter(Boolean)

  if (codeInsees.length === 0) {
    return NextResponse.json({ error: 'code_insee requis (liste séparée par virgule)' }, { status: 400 })
  }

  // Seuil 6 mois glissants
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dateLimit = sixMonthsAgo.toISOString().split('T')[0] // format YYYY-MM-DD

  const { data, error } = await supabase
    .from('adresses')
    .select('id, lat, lon, dpe_date, dpe_etiquette')
    .in('code_insee', codeInsees)
    .not('dpe_date', 'is', null)
    .gte('dpe_date', dateLimit)
    .limit(3000)

  if (error) {
    console.error('[DPE recents]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ adresses: data ?? [], total: data?.length ?? 0 })
}
