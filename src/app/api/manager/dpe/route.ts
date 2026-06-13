import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/manager/dpe?debut=YYYY-MM-DD&fin=YYYY-MM-DD
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const url   = new URL(req.url)
  const debut = url.searchParams.get('debut') ?? ''
  const fin   = url.searchParams.get('fin')   ?? ''

  const admin = createAdminClient()

  // Équipe du manager
  const { data: equipe } = await admin
    .from('commerciaux').select('id, nom, prenom').eq('manager_id', user.id).order('nom')
  if (!equipe?.length) return NextResponse.json({ stats: [] })

  const results = await Promise.all(equipe.map(async (c) => {
    // Communes du commercial
    const { data: communes } = await admin
      .from('communes').select('code_insee').eq('commercial_id', c.id)
    const codeInsees = (communes ?? []).map(x => x.code_insee)
    if (!codeInsees.length) return { ...c, nb_dpe_zone: 0, nb_dpe_hors_zone: 0, nb_dpe_prospecte: 0, taux_prospection: 0 }

    // DPE dans le secteur sur la période
    let dpeQuery = admin
      .from('dpe_logement')
      .select('adresse_id, code_insee, adresse_brute, date_etablissement, etiquette_dpe, type_batiment, adresses(id, zone_id)')
      .in('code_insee', codeInsees)
    if (debut) dpeQuery = dpeQuery.gte('date_etablissement', debut)
    if (fin)   dpeQuery = dpeQuery.lte('date_etablissement', fin)

    const { data: dpes } = await dpeQuery.limit(2000)
    if (!dpes?.length) return { ...c, nb_dpe_zone: 0, nb_dpe_hors_zone: 0, nb_dpe_prospecte: 0, taux_prospection: 0 }

    // Zones actives du commercial
    const { data: zones } = await admin
      .from('zones_prospection').select('id').eq('commercial_id', c.id).eq('statut', 'active')
    const zoneIds = new Set((zones ?? []).map(z => z.id))

    // Adresses prospectées : contacts ou interactions
    const adresseIds = dpes.map(d => d.adresse_id).filter(Boolean) as string[]

    const [{ data: contactsProsp }, { data: interactionsProsp }] = await Promise.all([
      adresseIds.length
        ? admin.from('contacts').select('adresse_id').in('adresse_id', adresseIds).eq('commercial_id', c.id)
        : Promise.resolve({ data: [] }),
      adresseIds.length
        ? admin.from('interactions').select('adresse_id, sessions_prospection!inner(commercial_id)')
            .in('adresse_id', adresseIds)
            .eq('sessions_prospection.commercial_id', c.id)
            .neq('action', 'rien')
        : Promise.resolve({ data: [] }),
    ])

    const prospectees = new Set([
      ...((contactsProsp ?? []).map(x => x.adresse_id).filter(Boolean)),
      ...((interactionsProsp ?? []).map(x => x.adresse_id).filter(Boolean)),
    ])

    let nb_dpe_zone = 0, nb_dpe_hors_zone = 0, nb_dpe_prospecte = 0

    for (const dpe of dpes) {
      const adresse = dpe.adresses as any
      const zoneId  = adresse?.zone_id ?? null
      const inZone  = zoneId && zoneIds.has(zoneId)

      if (inZone) nb_dpe_zone++
      else        nb_dpe_hors_zone++

      if (dpe.adresse_id && prospectees.has(dpe.adresse_id)) nb_dpe_prospecte++
    }

    const nb_total      = nb_dpe_zone + nb_dpe_hors_zone
    const taux_prospection = nb_total > 0 ? Math.round((nb_dpe_prospecte / nb_dpe_zone) * 100) : 0

    return { id: c.id, nom: c.nom, prenom: c.prenom, nb_dpe_zone, nb_dpe_hors_zone, nb_dpe_prospecte, taux_prospection }
  }))

  return NextResponse.json({ stats: results })
}
