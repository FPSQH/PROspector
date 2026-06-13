import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/manager/dpe/[commercial_id]?type=zone|hors_zone&debut=...&fin=...
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase
    .from('commerciaux').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { id: commercialId } = await params
  const url   = new URL(req.url)
  const type  = url.searchParams.get('type')  ?? 'zone'
  const debut = url.searchParams.get('debut') ?? ''
  const fin   = url.searchParams.get('fin')   ?? ''

  const admin = createAdminClient()

  // Vérifier que ce commercial appartient bien à ce manager
  const { data: commercial } = await admin
    .from('commerciaux').select('id, nom, prenom').eq('id', commercialId).eq('manager_id', user.id).single()
  if (!commercial) return NextResponse.json({ error: 'Commercial introuvable' }, { status: 404 })

  const { data: communes } = await admin
    .from('communes').select('code_insee').eq('commercial_id', commercialId)
  const codeInsees = (communes ?? []).map(x => x.code_insee)
  if (!codeInsees.length) return NextResponse.json({ adresses: [] })

  const { data: zones } = await admin
    .from('zones_prospection').select('id').eq('commercial_id', commercialId).eq('statut', 'active')
  const zoneIds = new Set((zones ?? []).map(z => z.id))

  let dpeQuery = admin
    .from('dpe_logement')
    .select('adresse_id, code_insee, adresse_brute, date_etablissement, etiquette_dpe, type_batiment, adresses(id, numero, nom_voie, code_postal, commune, lat, lon, zone_id, zones_prospection(nom, couleur))')
    .in('code_insee', codeInsees)
  if (debut) dpeQuery = dpeQuery.gte('date_etablissement', debut)
  if (fin)   dpeQuery = dpeQuery.lte('date_etablissement', fin)

  const { data: dpes } = await dpeQuery.order('date_etablissement', { ascending: false }).limit(500)

  // Filtrer selon type
  const filtered = (dpes ?? []).filter(d => {
    const adresse = d.adresses as any
    const inZone  = adresse?.zone_id && zoneIds.has(adresse.zone_id)
    return type === 'zone' ? inZone : !inZone
  })

  // Récupérer les qualifications pour ces adresses
  const adresseIds = filtered.map(d => d.adresse_id).filter(Boolean) as string[]

  const [{ data: contacts }, { data: interactions }] = await Promise.all([
    adresseIds.length
      ? admin.from('contacts').select('adresse_id, prenom, nom, statut_pipeline, date_relance, created_at')
          .in('adresse_id', adresseIds).eq('commercial_id', commercialId)
      : Promise.resolve({ data: [] }),
    adresseIds.length
      ? admin.from('interactions')
          .select('adresse_id, action, created_at, sessions_prospection!inner(commercial_id, date_session)')
          .in('adresse_id', adresseIds)
          .eq('sessions_prospection.commercial_id', commercialId)
          .neq('action', 'rien')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const contactsMap   = new Map<string, any[]>()
  const interactionsMap = new Map<string, any[]>()

  for (const c of contacts ?? []) {
    if (!c.adresse_id) continue
    if (!contactsMap.has(c.adresse_id)) contactsMap.set(c.adresse_id, [])
    contactsMap.get(c.adresse_id)!.push(c)
  }
  for (const i of interactions ?? []) {
    if (!i.adresse_id) continue
    if (!interactionsMap.has(i.adresse_id)) interactionsMap.set(i.adresse_id, [])
    interactionsMap.get(i.adresse_id)!.push(i)
  }

  const result = filtered.map(dpe => {
    const adresse    = dpe.adresses as any
    const adresseId  = dpe.adresse_id ?? ''
    const cts        = contactsMap.get(adresseId)   ?? []
    const its        = interactionsMap.get(adresseId) ?? []
    const prospecte  = cts.length > 0 || its.length > 0

    // Date de dernier passage (interaction ou contact le plus récent)
    const dates = [
      ...cts.map(c => c.created_at),
      ...its.map(i => (i.sessions_prospection as any)?.date_session ?? i.created_at),
    ].filter(Boolean).sort().reverse()
    const dernier_passage = dates[0] ?? null

    return {
      adresse_brute:    dpe.adresse_brute,
      adresse_id:       adresseId,
      adresse:          adresse ? `${adresse.numero ?? ''} ${adresse.nom_voie ?? ''}`.trim() || dpe.adresse_brute : dpe.adresse_brute,
      commune:          adresse?.commune ?? '',
      code_postal:      adresse?.code_postal ?? '',
      zone:             adresse?.zones_prospection as any ?? null,
      date_dpe:         dpe.date_etablissement,
      etiquette_dpe:    dpe.etiquette_dpe,
      type_batiment:    dpe.type_batiment,
      prospecte,
      dernier_passage,
      contacts:         cts.map(c => ({ prenom: c.prenom, nom: c.nom, statut: c.statut_pipeline })),
      actions:          its.map(i => ({ action: i.action, date: (i.sessions_prospection as any)?.date_session ?? i.created_at })),
    }
  })

  return NextResponse.json({ adresses: result, commercial })
}
