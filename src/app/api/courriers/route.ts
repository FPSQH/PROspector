import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/courriers?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD&limit=500
//
// Interroge directement l'API ADEME avec les codes INSEE du secteur actuel
// de l'utilisateur connecté + la plage de dates demandée.
// Toujours à jour, sans dépendance à l'ingestion préalable.

const DPE_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines'

const DPE_SELECT = [
  'numero_dpe', 'etiquette_dpe', 'etiquette_ges',
  'adresse_ban', 'numero_voie_ban', 'nom_rue_ban',
  'code_postal_ban', 'code_postal_brut', 'nom_commune_ban', 'code_insee_ban',
  'type_batiment', 'surface_habitable_logement',
  'date_etablissement_dpe',
  'conso_5_usages_par_m2_ep', 'cout_total_5_usages',
  'type_energie_principale_chauffage', 'emission_ges_5_usages_par_m2',
  'coordonnee_cartographique_x_ban', 'coordonnee_cartographique_y_ban',
].join(',')

// Conversion Lambert-93 (EPSG:2154) → WGS84 — formule IGN NTG_71
function lambert93ToWgs84(X: number, Y: number): { lat: number; lon: number } | null {
  const n  = 0.7256077650532670
  const C  = 11754255.4260960990
  const Xs = 700000.0
  const Ys = 12655612.0499
  const e  = 0.0818191910428158
  const dX = X - Xs, dY = Y - Ys
  const R  = Math.sqrt(dX*dX + dY*dY)
  if (R === 0) return null
  const gamma  = Math.atan(dX / (-dY))
  const lonRad = gamma / n + (3.0 * Math.PI / 180.0)
  const L      = -Math.log(R / C) / n
  let phi = 2 * Math.atan(Math.exp(L)) - Math.PI / 2
  for (let i = 0; i < 20; i++) {
    const s = e * Math.sin(phi)
    const p = 2 * Math.atan(Math.exp(L) * Math.pow((1+s)/(1-s), e/2)) - Math.PI/2
    if (Math.abs(p - phi) < 1e-10) { phi = p; break }
    phi = p
  }
  const lat = phi * 180.0 / Math.PI
  const lon = lonRad * 180.0 / Math.PI
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) return null
  return { lat, lon }
}

function normCP(v: any) { return String(v ?? '').trim().padStart(5, '0') }

function toIsoDate(val: any) {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{2})[/\-](\d{2})[/\-](\d{4})/)
  if (m) return m[3]+'-'+m[2]+'-'+m[1]
  return null
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dateDebut = searchParams.get('date_debut') ?? ''
  const dateFin   = searchParams.get('date_fin')   ?? ''
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '500'), 500)

  // ── Récupérer le commercial connecté ──────────────────────────────────────
  const adminDb = createAdminClient()
  let { data: commercial } = await adminDb
    .from('commerciaux')
    .select('id, nom, prenom, agence_nom, agence_adresse, agence_telephone, agence_email')
    .eq('id', user.id)
    .maybeSingle()

  if (!commercial) {
    const { data: asManager } = await adminDb
      .from('commerciaux')
      .select('id, nom, prenom, agence_nom, agence_adresse, agence_telephone, agence_email')
      .eq('manager_id', user.id)
      .limit(1).maybeSingle()
    commercial = asManager ?? null
  }
  if (!commercial) return NextResponse.json({ error: 'Profil non trouvé' }, { status: 403 })

  // ── Communes du secteur actuel ────────────────────────────────────────────
  const { data: communes } = await adminDb
    .from('communes')
    .select('code_insee, nom, code_postal')
    .eq('commercial_id', commercial.id)

  if (!communes?.length) {
    return NextResponse.json({ adresses: [], nb: 0, stats: { byLettre: {A:0,B:0,C:0,D:0,E:0,F:0,G:0}, nbAudit:0, nbSansAudit:0, nbHorsZone:0, total:0 } })
  }

  // ── Zones actives du commercial ───────────────────────────────────────────
  const { data: zones } = await adminDb
    .from('zones_prospection')
    .select('id, nom')
    .eq('commercial_id', commercial.id)
    .eq('statut', 'active')
  const zoneIds = new Set((zones ?? []).map((z: any) => z.id))
  const zoneNomMap = new Map((zones ?? []).map((z: any) => [z.id, z.nom]))

  // ── Adresses avec zone_id pour savoir si dans une zone ───────────────────
  const { data: adressesZones } = await adminDb
    .from('adresses')
    .select('id, zone_id')
    .in('code_insee', communes.map((c: any) => c.code_insee))
    .not('zone_id', 'is', null)
  const adresseZoneMap = new Map((adressesZones ?? []).map((a: any) => [a.id, a.zone_id]))

  // ── Contacts existants (pour badge "déjà contacté") ───────────────────────
  const { data: contacts } = await adminDb
    .from('contacts')
    .select('adresse_id')
    .eq('commercial_id', commercial.id)
  const contactAdresses = new Set((contacts ?? []).map((c: any) => c.adresse_id))

  // ── Requête ADEME pour chaque commune ─────────────────────────────────────
  const allRows: any[] = []

  for (const commune of communes) {
    const insee = commune.code_insee
    const cp    = normCP(commune.code_postal)

    // Filtre Lucene : code_insee + plage de dates
    const qsParts: string[] = [`code_insee_ban:"${insee}"`]
    if (dateDebut && dateFin) {
      qsParts.push(`date_etablissement_dpe:[${dateDebut} TO ${dateFin}]`)
    } else if (dateDebut) {
      qsParts.push(`date_etablissement_dpe:[${dateDebut} TO *]`)
    }
    const qs = qsParts.join(' AND ')

    const params = new URLSearchParams({
      size:   String(Math.ceil(limit / communes.length) + 50),
      select: DPE_SELECT,
      qs,
      sort:   '-date_etablissement_dpe',
    })

    try {
      const resp = await fetch(DPE_BASE + '?' + params)
      if (!resp.ok) continue
      const data = await resp.json()
      const rows = (data.results ?? []).filter((r: any) => {
        // Filtre client : vérifier code_insee
        return (r.code_insee_ban ?? '').toString() === insee.toString()
          || normCP(r.code_postal_ban) === cp
          || normCP(r.code_postal_brut) === cp
      })
      allRows.push(...rows)
    } catch (_) { continue }
  }

  // ── Dédupliquer par numero_dpe ─────────────────────────────────────────────
  const seen = new Set<string>()
  const unique = allRows.filter((r: any) => {
    const id = r.numero_dpe
    if (!id || seen.has(id)) return false
    seen.add(id); return true
  }).slice(0, limit)

  // ── Audits pour les DPE E/F/G ────────────────────────────────────────────
  const redNums = unique
    .filter((r: any) => ['E','F','G'].includes((r.etiquette_dpe||'').toUpperCase()))
    .map((r: any) => r.numero_dpe).filter(Boolean)

  const auditMap = new Map<string, any>()
  if (redNums.length) {
    const AUDIT_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/audit-opendata/lines'
    for (let i = 0; i < redNums.slice(0, 100).length; i += 20) {
      const batch = redNums.slice(i, i+20)
      const qsAudit = batch.map((n: string) => '"'+n+'"').join(' OR ')
      try {
        const resp = await fetch(AUDIT_BASE + '?' + new URLSearchParams({
          size: '100',
          select: 'n_audit,numero_dpe,date_etablissement_audit,classe_bilan_dpe,categorie_scenario,couts_cumules_travaux,gains_relatifs_cumules_conso_5_usages_m2_ep',
          qs: qsAudit
        }))
        if (resp.ok) {
          const data = await resp.json()
          for (const a of (data.results ?? [])) {
            if (!auditMap.has(a.numero_dpe)) {
              auditMap.set(a.numero_dpe, { n_audit: a.n_audit, date_audit: toIsoDate(a.date_etablissement_audit), scenarios: [] })
            }
            const entry = auditMap.get(a.numero_dpe)
            entry.scenarios.push({
              categorie:    a.categorie_scenario,
              classe_apres: a.classe_bilan_dpe,
              cout_travaux: a.couts_cumules_travaux,
              gain_pct:     a.gains_relatifs_cumules_conso_5_usages_m2_ep
                ? Math.round(Number(a.gains_relatifs_cumules_conso_5_usages_m2_ep) * 100)
                : null,
            })
          }
        }
      } catch (_) {}
    }
  }

  // ── Construire la réponse ─────────────────────────────────────────────────
  const byLettre: Record<string, number> = {A:0,B:0,C:0,D:0,E:0,F:0,G:0}
  let nbAudit = 0, nbSansAudit = 0, nbHorsZone = 0

  const adresses = unique.map((r: any) => {
    const dpe = (r.etiquette_dpe || '').charAt(0).toUpperCase()
    if (byLettre[dpe] !== undefined) byLettre[dpe]++

    const adresse_brute = r.adresse_ban
      || (r.numero_voie_ban && r.nom_rue_ban ? (r.numero_voie_ban+' '+r.nom_rue_ban).trim() : null)
      || ''

    // Coordonnées Lambert93 → WGS84
    let lat: number|null = null, lon: number|null = null
    const x = parseFloat(r.coordonnee_cartographique_x_ban)
    const y = parseFloat(r.coordonnee_cartographique_y_ban)
    if (!isNaN(x) && !isNaN(y) && x !== 0 && y !== 0) {
      const wgs = lambert93ToWgs84(x, y)
      if (wgs) { lat = wgs.lat; lon = wgs.lon }
    }

    // Zone de l'adresse (via BAN id ou correspondance adresse)
    // On cherche l'adresse en base par numero_dpe ou adresse_brute
    // Pour simplifier : zone_id null si pas matché
    const audit = auditMap.get(r.numero_dpe) ?? null
    const isRed = ['E','F','G'].includes(dpe)
    if (isRed && audit) nbAudit++
    else if (isRed) nbSansAudit++

    const latest_dpe_date = toIsoDate(r.date_etablissement_dpe)

    return {
      id:                 r.numero_dpe,
      adresse_brute,
      code_postal:        normCP(r.code_postal_ban || r.code_postal_brut),
      code_insee:         r.code_insee_ban ?? '',
      nom_commune:        r.nom_commune_ban ?? '',
      type_bien:          r.type_batiment ?? null,
      surface_habitable:  r.surface_habitable_logement ?? null,
      dpe_etiquette:      dpe || null,
      dpe_ges:            (r.etiquette_ges || '').charAt(0).toUpperCase() || null,
      latest_dpe_date,
      dpe_numero:         r.numero_dpe,
      conso_ep_m2:        r.conso_5_usages_par_m2_ep ?? null,
      cout_annuel:        r.cout_total_5_usages ?? null,
      energie_principale: r.type_energie_principale_chauffage ?? null,
      ges_m2:             r.emission_ges_5_usages_par_m2 ?? null,
      lat, lon,
      zone_id:            null, // enrichi si besoin ultérieur
      zone_nom:           null,
      has_audit:          !!audit,
      audit,
      deja_contacte:      false, // enrichi si besoin
      agent_nom:          commercial?.nom ?? '',
      agent_prenom:       commercial?.prenom ?? '',
      agent_agence:       commercial?.agence_nom ?? '',
      agent_telephone:    commercial?.agence_telephone ?? '',
      agent_email:        commercial?.agence_email ?? '',
    }
  })

  nbHorsZone = adresses.filter((a: any) => !a.zone_id).length

  return NextResponse.json({
    adresses,
    nb: adresses.length,
    stats: { byLettre, nbAudit, nbSansAudit, nbHorsZone, total: adresses.length }
  })
}
