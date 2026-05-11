import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/prospection-libre/adresses?code_insee=XXXXX
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const code_insee = searchParams.get('code_insee')
  if (!code_insee) return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })

  // Vérifier que la commune appartient au secteur du commercial
  const { data: commune } = await supabase
    .from('communes')
    .select('code_insee, nom, code_postal')
    .eq('commercial_id', user.id)
    .eq('code_insee', code_insee)
    .single()

  if (!commune) return NextResponse.json({ error: 'Commune non autorisée' }, { status: 403 })

  // Charger toutes les zones du commercial (pour affichage polygones + badges)
  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, couleur, numero, polygone_geojson')
    .eq('commercial_id', user.id)
    .eq('statut', 'active')

  // Charger toutes les adresses de la commune (BAN + manuelles)
  const allAdresses: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('adresses')
      .select(`
        id, lat, lon, numero, nom_voie, code_postal, commune, code_insee,
        type_bien, nb_bal, prospectable, type_habitat, mode_prospection,
        statut_prospectabilite, motif_exclusion, commentaire_adresse,
        nom_syndic, courrier_cible_possible, zone_id, is_manuelle,
        latest_dpe_date
      `)
      .eq('code_insee', code_insee)
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .range(from, from + 999)

    if (error || !data || data.length === 0) break
    allAdresses.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  // Enrichir chaque adresse avec le nom de zone
  const zoneMap = new Map((zones ?? []).map((z: any) => [z.id, z]))
  const adressesEnrichies = allAdresses.map((a: any) => {
    const zone = a.zone_id ? zoneMap.get(a.zone_id) : null
    return {
      ...a,
      zone_nom:     zone?.nom    ?? null,
      zone_couleur: zone?.couleur ?? null,
      zone_numero:  zone?.numero ?? null,
    }
  })

  // DPE les plus récents par adresse
  const adresseIds = allAdresses.map((a: any) => a.id)
  const dpeMap: Record<string, any> = {}
  if (adresseIds.length > 0) {
    const { data: dpes } = await supabase
      .from('dpe_logement')
      .select('adresse_id, date_etablissement, etiquette_dpe, has_audit, audit_n')
      .in('adresse_id', adresseIds)
      .order('date_etablissement', { ascending: false })
    for (const d of (dpes ?? [])) {
      if (!dpeMap[d.adresse_id]) dpeMap[d.adresse_id] = {
        latest_dpe_date: d.date_etablissement,
        etiquette_dpe:   d.etiquette_dpe ?? null,
        has_audit:       d.has_audit ?? false,
        audit_n:         d.audit_n ?? null,
      }
    }
  }

  const result = adressesEnrichies.map((a: any) => ({
    ...a,
    ...(dpeMap[a.id] ?? {}),
  }))

  return NextResponse.json({
    adresses: result,
    nb: result.length,
    commune,
    zones: (zones ?? []).map((z: any) => ({
      id: z.id, nom: z.nom, couleur: z.couleur, numero: z.numero,
      polygone_geojson: z.polygone_geojson,
    })),
  })
}
