import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ZoneService, ZoneGenerationOptions } from '@/lib/services/zoneService'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))

    // Configuration des options de génération
    const options: ZoneGenerationOptions = {
      nb_zones:            body.nb_zones            ?? 12,
      capacite_cible:      body.capacite_cible      ?? 100,
      rayon_metres:        body.rayon_metres        ?? body.rayon_alerte_metres ?? 800,
      exclure_commerces:   body.exclure_commerces   ?? false,
      dpe_fenetre_mois:    body.dpe_fenetre_mois    ?? 6,
      dpe_poids:           body.dpe_poids           ?? 0,
      dpe_seuil_inclusion: body.dpe_seuil_inclusion ?? 10,
      poids_collectif:     body.poids_collectif      ?? 0.5,
    }

    // Utilisation du Service Layer pour toute la logique métier
    const zoneService = new ZoneService(supabase)
    const result = await zoneService.generateAndSaveZones(user.id, options)

    return NextResponse.json({
      success: true,
      ...result,
      config: options,
    })

  } catch (error: any) {
    console.error('[API ZONES GENERATE]', error)
    return NextResponse.json({
      error: error.message || 'Une erreur est survenue lors de la génération des zones'
    }, { status: 500 })
  }
}
