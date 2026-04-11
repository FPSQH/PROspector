import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean)
  if (!ids.length) return NextResponse.json({ zones: [] })

  const { data: zonesRaw } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_adresses, nb_prospectables, nb_dpe_chauds')
    .in('id', ids)
    .eq('commercial_id', user.id)
    .order('numero')

  if (!zonesRaw?.length) return NextResponse.json({ zones: [] })

  // Calculer les DPE < 6 mois reels par zone (depuis dpe_logement)
  const since6m = new Date()
  since6m.setMonth(since6m.getMonth() - 6)
  const since6mStr = since6m.toISOString().slice(0, 10)

  const zones = []
  for (const z of zonesRaw) {
    // Adresses de la zone
    const adresses: any[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('lat, lon, type_bien')
        .eq('zone_id', z.id)
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      adresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }

    // Compter les DPE < 6 mois matches sur les adresses de cette zone
    // Via une requete sur dpe_logement jointe aux adresses de la zone
    const { count: dpeCount } = await supabase
      .from('dpe_logement')
      .select('id', { count: 'exact', head: true })
      .gte('date_etablissement', since6mStr)
      .not('adresse_id', 'is', null)
      .in('adresse_id', adresses.slice(0, 400).map(a => a.id).filter(Boolean))

    // nb_dpe_chauds depuis la colonne zone si dispo, sinon count live
    const nbDpeChauds = z.nb_dpe_chauds > 0 ? z.nb_dpe_chauds : (dpeCount ?? 0)

    zones.push({ ...z, nb_dpe_chauds: nbDpeChauds, adresses })
  }

  return NextResponse.json({ zones })
}
