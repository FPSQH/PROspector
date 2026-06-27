// GET /api/zones/stats
// Retourne pour chaque zone : couverture mois, DPE récents (<2 mois), dernière session, nb contacts

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Toutes les zones actives
  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nb_prospectables')
    .eq('commercial_id', user.id)
    .eq('statut', 'active')

  if (!zones || zones.length === 0) return NextResponse.json({ stats: {} })

  const zoneIds = zones.map(z => z.id)
  const nbProspMap: Record<string, number> = {}
  for (const z of zones) nbProspMap[z.id] = z.nb_prospectables ?? 0

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()).toISOString().split('T')[0]

  // ── Requêtes parallèles ───────────────────────────────────────────────────
  const [sessMonthRes, lastSessRes, contactsRes, adresseIdsRes] = await Promise.all([
    // Sessions du mois en cours
    supabase
      .from('sessions_prospection')
      .select('zone_id, nb_portes')
      .eq('commercial_id', user.id)
      .in('zone_id', zoneIds)
      .in('statut', ['realisee', 'en_cours'])
      .gte('date_session', firstOfMonth)
      .lte('date_session', today),

    // Dernière session réalisée par zone (limite raisonnable pour éviter de tout charger)
    supabase
      .from('sessions_prospection')
      .select('zone_id, date_session')
      .eq('commercial_id', user.id)
      .in('zone_id', zoneIds)
      .eq('statut', 'realisee')
      .order('date_session', { ascending: false })
      .limit(zoneIds.length * 10),

    // Contacts rattachés à la zone
    supabase
      .from('contacts')
      .select('zone_id')
      .eq('commercial_id', user.id)
      .in('zone_id', zoneIds),

    // IDs adresses par zone (pour comptage DPE)
    supabase
      .from('adresses')
      .select('id, zone_id')
      .in('zone_id', zoneIds),
  ])

  // ── Couverture mois + nb sessions ce mois ─────────────────────────────────
  const portesMap: Record<string, number>       = {}
  const sessionsMonthMap: Record<string, number> = {}
  for (const s of (sessMonthRes.data ?? [])) {
    if (!s.zone_id) continue
    portesMap[s.zone_id]       = (portesMap[s.zone_id]       ?? 0) + (s.nb_portes ?? 0)
    sessionsMonthMap[s.zone_id] = (sessionsMonthMap[s.zone_id] ?? 0) + 1
  }

  // ── Dernière session par zone ─────────────────────────────────────────────
  const lastSessionMap: Record<string, string> = {}
  for (const s of (lastSessRes.data ?? [])) {
    if (!s.zone_id || lastSessionMap[s.zone_id]) continue
    lastSessionMap[s.zone_id] = s.date_session
  }

  // ── Contacts par zone ─────────────────────────────────────────────────────
  const contactsMap: Record<string, number> = {}
  for (const c of (contactsRes.data ?? [])) {
    if (!c.zone_id) continue
    contactsMap[c.zone_id] = (contactsMap[c.zone_id] ?? 0) + 1
  }

  // ── DPE récents < 2 mois par zone ─────────────────────────────────────────
  const adresseToZone: Record<string, string> = {}
  const allAdresseIds: string[] = []
  for (const a of (adresseIdsRes.data ?? [])) {
    if (!a.zone_id) continue
    adresseToZone[a.id] = a.zone_id
    allAdresseIds.push(a.id)
  }

  const dpeMap: Record<string, number> = {}
  if (allAdresseIds.length > 0) {
    const adminDb = createAdminClient()
    const batches: string[][] = []
    for (let i = 0; i < allAdresseIds.length; i += 500) {
      batches.push(allAdresseIds.slice(i, i + 500))
    }
    const dpeResults = await Promise.all(
      batches.map(batch => adminDb
        .from('dpe_logement')
        .select('adresse_id')
        .in('adresse_id', batch)
        .gte('date_etablissement', twoMonthsAgo)
      )
    )
    for (const { data: dpes } of dpeResults) {
      for (const d of (dpes ?? [])) {
        const zoneId = adresseToZone[d.adresse_id]
        if (zoneId) dpeMap[zoneId] = (dpeMap[zoneId] ?? 0) + 1
      }
    }
  }

  // ── Assemblage final ──────────────────────────────────────────────────────
  const stats: Record<string, {
    couverture_mois_pct:    number
    couverture_mois_nb:     number
    dpe_recents_nb:         number
    derniere_session_date:  string | null
    sessions_mois_nb:       number
    nb_contacts:            number
  }> = {}

  for (const z of zones) {
    const nbProsp  = nbProspMap[z.id] ?? 0
    const nbPortes = portesMap[z.id]  ?? 0
    stats[z.id] = {
      couverture_mois_pct:   nbProsp > 0 ? Math.round((nbPortes / nbProsp) * 100) : 0,
      couverture_mois_nb:    nbPortes,
      dpe_recents_nb:        dpeMap[z.id]        ?? 0,
      derniere_session_date: lastSessionMap[z.id] ?? null,
      sessions_mois_nb:      sessionsMonthMap[z.id] ?? 0,
      nb_contacts:           contactsMap[z.id]    ?? 0,
    }
  }

  return NextResponse.json({ stats }, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
  })
}
