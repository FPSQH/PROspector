import { createClient } from '@/lib/supabase/server'
import { getEffectiveCommercialId } from '@/lib/delegation'
import { NextResponse } from 'next/server'

// GET /api/explorer/addresses
// Filtres : type_bien, zone_id, statut, has_dpe, has_dvf,
//           dpe_classes (ex. "E,F,G"), dpe_recence (mois), has_audit,
//           non_visitee_mois (adresses sans passage terrain depuis N mois)
//
// Le DPE et le statut de prospection sont dérivés de dpe_logement et
// interactions (comme /api/adresses/secteur) : la table adresses ne
// porte pas ces colonnes de manière fiable.

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()
  const { searchParams } = new URL(req.url)

  const typeBien       = searchParams.get('type_bien')
  const zoneId         = searchParams.get('zone_id')
  const hasDpe         = searchParams.get('has_dpe') === 'true'
  const hasDvf         = searchParams.get('has_dvf') === 'true'
  const statut         = searchParams.get('statut')
  const dpeClasses     = (searchParams.get('dpe_classes') ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  const dpeRecence     = parseInt(searchParams.get('dpe_recence') ?? '0', 10)
  const hasAudit       = searchParams.get('has_audit') === 'true'
  const nonVisiteeMois = parseInt(searchParams.get('non_visitee_mois') ?? '0', 10)

  const { data: communes } = await supabase
    .from('communes').select('code_insee').eq('commercial_id', effectiveId)

  if (!communes?.length) return NextResponse.json({ addresses: [], total: 0 })

  const codesInsee = communes.map((c: any) => c.code_insee)

  // ── 1. Adresses de base (colonnes garanties) ─────────────────────
  const addresses: any[] = []
  for (const batchInsee of chunk(codesInsee, 5)) {
    let from = 0
    while (true) {
      let query = supabase
        .from('adresses')
        .select('id, lat, lon, type_bien, zone_id')
        .in('code_insee', batchInsee)
        .eq('prospectable', true)
        .range(from, from + 999)

      if (typeBien) query = query.eq('type_bien', typeBien)
      if (zoneId)   query = query.eq('zone_id', zoneId)

      const { data, error } = await query
      if (error) { console.error('[explorer/addresses] adresses:', error.message); break }
      if (!data?.length) break
      addresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── 2. Dernier DPE par adresse (depuis dpe_logement) ─────────────
  // Sert la coloration carte, les filtres étiquette/récence/has_dpe/has_audit.
  const dpeMap = new Map<string, { etiquette: string | null; date: string | null; audit: boolean }>()
  {
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('dpe_logement')
        .select('adresse_id, etiquette_dpe, date_etablissement, has_audit')
        .in('code_insee', codesInsee)
        .not('adresse_id', 'is', null)
        .order('date_etablissement', { ascending: false })
        .range(from, from + 999)
      if (error) { console.error('[explorer/addresses] dpe:', error.message); break }
      const rows = (data ?? []) as any[]
      if (!rows.length) break
      for (const r of rows) {
        const cur = dpeMap.get(r.adresse_id)
        if (!cur) {
          dpeMap.set(r.adresse_id, {
            etiquette: (r.etiquette_dpe ?? '').toUpperCase() || null,
            date:      r.date_etablissement ?? null,
            audit:     !!r.has_audit,
          })
        } else if (r.has_audit) {
          cur.audit = true // audit sur n'importe quel DPE de l'adresse
        }
      }
      if (rows.length < 1000) break
      from += 1000
    }
  }

  // ── 3. Statut terrain + date du dernier passage (interactions) ───
  const statutMap    = new Map<string, string>()
  const lastVisitMap = new Map<string, string>()
  const needStatut   = true // toujours : sert la coloration par statut côté client
  if (needStatut && addresses.length > 0) {
    const adresseIds = addresses.map(a => a.id)
    for (const batch of chunk(adresseIds, 500)) {
      const { data, error } = await supabase
        .from('interactions')
        .select('adresse_id, statut_adresse, created_at')
        .in('adresse_id', batch)
        .order('created_at', { ascending: false })
      if (error) { console.error('[explorer/addresses] interactions:', error.message); break }
      for (const row of (data ?? []) as any[]) {
        if (!statutMap.has(row.adresse_id) && row.statut_adresse) statutMap.set(row.adresse_id, row.statut_adresse)
        if (!lastVisitMap.has(row.adresse_id)) lastVisitMap.set(row.adresse_id, row.created_at)
      }
    }
  }

  // ── 4. Enrichissement + filtres ───────────────────────────────────
  const recenceCutoff = (() => {
    if (dpeRecence <= 0) return null
    const d = new Date(); d.setMonth(d.getMonth() - dpeRecence)
    return d.toISOString().slice(0, 10)
  })()
  const visiteCutoff = (() => {
    if (nonVisiteeMois <= 0) return null
    const d = new Date(); d.setMonth(d.getMonth() - nonVisiteeMois)
    return d.toISOString()
  })()

  let result = addresses.map((a: any) => {
    const dpe = dpeMap.get(a.id)
    return {
      id: a.id, lat: a.lat, lon: a.lon,
      type_bien: a.type_bien ?? 'inconnu',
      zone_id: a.zone_id,
      dpe_etiquette:      dpe?.etiquette ?? null,
      latest_dpe_date:    dpe?.date ?? null,
      statut_prospection: statutMap.get(a.id) ?? 'jamais_vue',
      _has_audit:         dpe?.audit ?? false,
    }
  })

  if (statut)             result = result.filter(a => a.statut_prospection === statut)
  if (hasDpe)             result = result.filter(a => a.latest_dpe_date != null)
  if (dpeClasses.length)  result = result.filter(a => a.dpe_etiquette && dpeClasses.includes(a.dpe_etiquette))
  if (recenceCutoff)      result = result.filter(a => a.latest_dpe_date && a.latest_dpe_date >= recenceCutoff)
  if (hasAudit)           result = result.filter(a => a._has_audit)
  if (visiteCutoff)       result = result.filter(a => {
    const last = lastVisitMap.get(a.id)
    return !last || last < visiteCutoff
  })

  // ── 5. Filtre has_dvf : adresses avec transaction à proximité ────
  if (hasDvf && result.length > 0) {
    const dvfIds = new Set<string>()
    const { data } = await (supabase as any)
      .rpc('dvf_density_per_address', { p_codes_insee: codesInsee, p_annees: 5 })
    for (const row of (data ?? [])) dvfIds.add((row as any).adresse_id)
    result = result.filter((a: any) => dvfIds.has(a.id))
  }

  // Retirer le champ interne
  const clean = result.map(({ _has_audit, ...rest }) => rest)

  return NextResponse.json({ addresses: clean, total: clean.length })
}
