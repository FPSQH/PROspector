// src/app/api/dpe/recents/route.ts
//
// GET /api/dpe/recents?code_insee=22362,22152,...
//
// Retourne les DPE établis dans les 6 derniers mois depuis dpe_logement
// (source unifiée — Étape 4 moteur DPE).
// Utilisé par la page Zones pour afficher le calque "DPE récents".

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const codeInseeParam = searchParams.get('code_insee') ?? ''
  const codeInsees = codeInseeParam.split(',').map(s => s.trim()).filter(Boolean)
  if (!codeInsees.length) {
    return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })
  }

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dateLimit = sixMonthsAgo.toISOString().slice(0, 10)

  const adminDb = createAdminClient()
  const { data, error } = await adminDb
    .from('dpe_logement')
    .select('id, lat, lon, date_etablissement, etiquette_dpe, type_batiment, adresse_id')
    .in('code_insee', codeInsees)
    .gte('date_etablissement', dateLimit)
    .not('lat', 'is', null)
    .order('date_etablissement', { ascending: false })
    .limit(3000)

  if (error) {
    console.error('[DPE recents]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Normaliser au format attendu par ZonesMap
  const adresses = (data ?? []).map((d: any) => ({
    id:            d.id,
    lat:           d.lat,
    lon:           d.lon,
    dpe_date:      d.date_etablissement,
    dpe_etiquette: d.etiquette_dpe,
    type_batiment: d.type_batiment,
    adresse_id:    d.adresse_id,
  }))

  return NextResponse.json({ adresses, total: adresses.length })
}
