import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ══════════════════════════════════════════════════════════════════
// POST /api/dpe/ingest
//
// Ingestion DPE ADEME complète (5 ans) ou incrémentale.
// Stocke TOUS les champs + audits intégrés.
// Après ingestion : matching GPS 50m + mise à jour derniere_verif_dpe.
//
// Body : { code_postal, code_insee, after?, force_full? }
// Retourne : { nb_inserted, nb_updated, nb_audits, nb_matched, after, has_more, mode }
// ══════════════════════════════════════════════════════════════════

const DPE_BASE   = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines'
const AUDIT_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/audit-opendata/lines'

// Tous les champs nécessaires (5 ans, matching, courriers, terrain, zones)
const DPE_FIELDS = [
  'numero_dpe',
  'adresse_ban', 'numero_voie_ban', 'nom_rue_ban',
  'code_postal_ban', 'code_postal_brut',
  'nom_commune_ban', 'code_insee_ban',
  'type_batiment', 'surface_habitable_logement', 'nombre_appartement',
  'annee_construction',
  'etiquette_dpe', 'etiquette_ges',
  'date_etablissement_dpe', 'date_derniere_modification_dpe', 'date_fin_validite_dpe',
  'conso_5_usages_par_m2_ep', 'cout_total_5_usages',
  'type_energie_principale_chauffage', 'emission_ges_5_usages_par_m2',
  'coordonnee_cartographique_x_ban', 'coordonnee_cartographique_y_ban',
].join(',')

const AUDIT_FIELDS = [
  'n_audit', 'numero_dpe', 'date_etablissement_audit',
  'classe_bilan_dpe', 'categorie_scenario', 'etape_travaux',
  'couts_cumules_travaux', 'gains_relatifs_cumules_conso_5_usages_m2_ep',
  'gains_cumules_facture_max', 'gains_cumules_facture_min',
].join(',')

// ── Utilitaires ───────────────────────────────────────────────────
function normCP(v: any) {
  return String(v ?? '').trim().padStart(5, '0')
}

function toIsoDate(val: any): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{2})[/\-](\d{2})[/\-](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

// Conversion Lambert-93 (EPSG:2154) → WGS84
// Formule IGN NTG_71, validée sur Tréguier/Paris/Marseille
function lambert93ToWgs84(X: number, Y: number): { lat: number; lon: number } | null {
  const n  = 0.7256077650532670
  const C  = 11754255.4260960990
  const Xs = 700000.0
  const Ys = 12655612.0499
  const e  = 0.0818191910428158

  const dX  = X - Xs
  const dY  = Y - Ys
  const R   = Math.sqrt(dX * dX + dY * dY)
  if (R === 0) return null

  const gamma  = Math.atan(dX / (-dY))
  const lonRad = gamma / n + (3.0 * Math.PI / 180.0)
  const L      = -Math.log(R / C) / n

  let phi = 2 * Math.atan(Math.exp(L)) - Math.PI / 2
  for (let i = 0; i < 20; i++) {
    const s      = e * Math.sin(phi)
    const phiNew = 2 * Math.atan(Math.exp(L) * Math.pow((1 + s) / (1 - s), e / 2)) - Math.PI / 2
    if (Math.abs(phiNew - phi) < 1e-10) { phi = phiNew; break }
    phi = phiNew
  }

  const lat = phi * 180.0 / Math.PI
  const lon = lonRad * 180.0 / Math.PI
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) return null
  return { lat, lon }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Fetch une page ADEME ──────────────────────────────────────────
async function fetchAdemePage(params: URLSearchParams): Promise<{ rows: any[]; nextAfter: string | null }> {
  const resp = await fetch(DPE_BASE + '?' + params)
  if (!resp.ok) throw new Error(`ADEME HTTP ${resp.status}`)
  const data = await resp.json()
  const rows = data.results ?? []
  let nextAfter: string | null = null
  if (data.next) {
    try { nextAfter = new URL(data.next).searchParams.get('after') } catch (_) {}
  }
  return { rows, nextAfter }
}

// ── Fetch audits pour une liste de numero_dpe ─────────────────────
async function fetchAudits(numeroDpes: string[]): Promise<Map<string, any>> {
  const auditMap = new Map<string, any>()
  for (const batch of chunk(numeroDpes, 20)) {
    const qs = batch.map(n => `"${n}"`).join(' OR ')
    try {
      const resp = await fetch(AUDIT_BASE + '?' + new URLSearchParams({
        size: '100', select: AUDIT_FIELDS, qs
      }))
      if (!resp.ok) continue
      const data = await resp.json()
      for (const a of (data.results ?? [])) {
        const numDpe = a.numero_dpe
        if (!numDpe) continue
        if (!auditMap.has(numDpe)) {
          auditMap.set(numDpe, {
            n_audit:    a.n_audit,
            audit_date: toIsoDate(a.date_etablissement_audit),
            scenarios:  []
          })
        }
        const entry = auditMap.get(numDpe)
        if (a.categorie_scenario && !/état\s*initial/i.test(a.categorie_scenario)) {
          entry.scenarios.push({
            categorie:    a.categorie_scenario,
            etape:        a.etape_travaux ?? null,
            classe_apres: a.classe_bilan_dpe ?? null,
            cout_travaux: a.couts_cumules_travaux ? Number(a.couts_cumules_travaux) : null,
            gain_pct:     a.gains_relatifs_cumules_conso_5_usages_m2_ep
              ? Math.round(Number(a.gains_relatifs_cumules_conso_5_usages_m2_ep) * 100)
              : null,
            gain_facture_min: a.gains_cumules_facture_min ? Number(a.gains_cumules_facture_min) : null,
            gain_facture_max: a.gains_cumules_facture_max ? Number(a.gains_cumules_facture_max) : null,
          })
        }
      }
    } catch (_) { continue }
  }
  return auditMap
}

// ── Route principale ──────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase  = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.code_postal || !body?.code_insee) {
    return NextResponse.json({ error: 'code_postal et code_insee requis' }, { status: 400 })
  }

  const { code_postal, code_insee, force_full = false } = body
  const afterCursor: string | null = body.after ?? null
  const cpTarget = normCP(code_postal)
  const SIZE = 500 // max recommandé ADEME

  const adminDb = createAdminClient()

  // ── Déterminer le mode (full / incremental / pagination) ─────────
  let filterDate: string | null = null
  let mode = 'full'

  if (!force_full && !afterCursor) {
    const { data: commune } = await adminDb
      .from('communes')
      .select('derniere_verif_dpe')
      .eq('code_insee', code_insee)
      .maybeSingle()

    if (commune?.derniere_verif_dpe) {
      filterDate = new Date(commune.derniere_verif_dpe).toISOString().slice(0, 10)
      mode = 'incremental'
    } else {
      // 5 ans d'historique pour la 1ère ingestion
      const fiveYearsAgo = new Date()
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)
      filterDate = fiveYearsAgo.toISOString().slice(0, 10)
      mode = 'full'
    }
  } else if (afterCursor) {
    mode = 'pagination'
  }

  // ── Construction des paramètres ADEME ────────────────────────────
  const params = new URLSearchParams({ size: String(SIZE), select: DPE_FIELDS })

  if (mode === 'incremental' && filterDate) {
    // Incrémental : DPE modifiés depuis la dernière vérification
    params.set('qs', `code_insee_ban:"${code_insee}" AND date_derniere_modification_dpe:[${filterDate} TO *]`)
  } else {
    // Full ou pagination : DPE établis depuis 5 ans
    const qsParts = [`code_insee_ban:"${code_insee}"`]
    if (filterDate) qsParts.push(`date_etablissement_dpe:[${filterDate} TO *]`)
    params.set('qs', qsParts.join(' AND '))
  }

  params.set('sort', '-date_etablissement_dpe')
  if (afterCursor) params.set('after', afterCursor)

  // ── Appel ADEME ───────────────────────────────────────────────────
  let rows: any[], nextAfter: string | null
  try {
    const result = await fetchAdemePage(params)
    rows = result.rows
    nextAfter = result.nextAfter
  } catch (err: any) {
    return NextResponse.json({ error: `API ADEME: ${err.message}` }, { status: 502 })
  }

  // ── Filtre client strict (code_insee) ────────────────────────────
  const filtered = rows.filter(r => {
    const inseeOk = (r.code_insee_ban ?? '').toString() === code_insee.toString()
    const cpOk    = normCP(r.code_postal_ban) === cpTarget || normCP(r.code_postal_brut) === cpTarget
    return inseeOk || cpOk
  })

  // ── Récupérer les audits pour les DPE E/F/G ──────────────────────
  const redNums = filtered
    .filter(r => ['E','F','G'].includes((r.etiquette_dpe || '').toUpperCase()))
    .map(r => r.numero_dpe)
    .filter(Boolean)

  const auditMap = redNums.length > 0 ? await fetchAudits(redNums) : new Map()

  // ── Construire les lignes à upsert ────────────────────────────────
  const toUpsert = filtered.map(r => {
    const idDpe = (r.numero_dpe || '').trim()
    if (!idDpe) return null

    // Coordonnées Lambert93 → WGS84
    // Le trigger fill_dpe_geom() remplit geom automatiquement depuis lat/lon
    let dpe_lat: number | null = null
    let dpe_lon: number | null = null
    const x = parseFloat(r.coordonnee_cartographique_x_ban)
    const y = parseFloat(r.coordonnee_cartographique_y_ban)
    if (!isNaN(x) && !isNaN(y) && x !== 0 && y !== 0) {
      const wgs = lambert93ToWgs84(x, y)
      if (wgs) { dpe_lat = wgs.lat; dpe_lon = wgs.lon }
    }

    const adresse_brute = r.adresse_ban
      || (r.numero_voie_ban && r.nom_rue_ban ? `${r.numero_voie_ban} ${r.nom_rue_ban}`.trim() : null)
      || ''

    const audit = auditMap.get(idDpe) ?? null

    return {
      numero_dpe:          idDpe,
      code_insee:          code_insee,
      code_postal:         normCP(r.code_postal_ban || r.code_postal_brut) || cpTarget,
      adresse_brute,
      type_batiment:       (r.type_batiment || '').toLowerCase().trim() || null,
      surface_habitable:   r.surface_habitable_logement != null ? Number(r.surface_habitable_logement) : null,
      nombre_appartement:  r.nombre_appartement != null ? Number(r.nombre_appartement) : null,
      annee_construction:  r.annee_construction != null ? Number(r.annee_construction) : null,
      etiquette_dpe:       (r.etiquette_dpe || '').charAt(0).toUpperCase() || null,
      etiquette_ges:       (r.etiquette_ges || '').charAt(0).toUpperCase() || null,
      date_etablissement:  toIsoDate(r.date_etablissement_dpe),
      date_modification:   toIsoDate(r.date_derniere_modification_dpe),
      date_fin_validite:   toIsoDate(r.date_fin_validite_dpe),
      conso_ep_m2:         r.conso_5_usages_par_m2_ep != null ? Number(r.conso_5_usages_par_m2_ep) : null,
      cout_annuel:         r.cout_total_5_usages != null ? Number(r.cout_total_5_usages) : null,
      energie_principale:  r.type_energie_principale_chauffage ?? null,
      ges_m2:              r.emission_ges_5_usages_par_m2 != null ? Number(r.emission_ges_5_usages_par_m2) : null,
      lat:                 dpe_lat,
      lon:                 dpe_lon,
      // geom est rempli automatiquement par le trigger fill_dpe_geom()
      match_confiance:     'non_matche',
      has_audit:           !!audit,
      audit_n:             audit?.n_audit ?? null,
      audit_date:          audit?.audit_date ?? null,
      audit_scenarios:     audit?.scenarios?.length ? audit.scenarios : null,
    }
  }).filter(Boolean)

  // ── Upsert en base (par batch de 100) ────────────────────────────
  let nbInserted = 0, nbAudits = 0
  for (const batch of chunk(toUpsert, 100)) {
    const { error } = await adminDb
      .from('dpe_logement')
      .upsert(batch as any[], { onConflict: 'numero_dpe', ignoreDuplicates: false })
    if (!error) {
      nbInserted += batch.length
      nbAudits   += batch.filter((b: any) => b?.has_audit).length
    } else {
      console.error('[DPE] upsert error:', error.message)
    }
  }

  // ── Post-ingestion : matching + mise à jour commune ───────────────
  const hasMore = nextAfter !== null && rows.length >= SIZE
  if (!hasMore) {
    // Matching GPS 50m
    let nbMatched = 0
    try {
      const { data: matchResult } = await adminDb.rpc('match_dpe_to_adresses', { p_code_insee: code_insee })
      nbMatched = matchResult ?? 0
    } catch (_) {}

    // Rafraîchir la vue matérialisée
    try {
      await adminDb.rpc('refresh_mv_dpe_stats')
    } catch (_) {
      // La fonction n'existe pas encore — on met à jour communes.nb_dpe manuellement
      const { count } = await adminDb
        .from('dpe_logement')
        .select('id', { count: 'exact', head: true })
        .eq('code_insee', code_insee)
      await adminDb
        .from('communes')
        .update({ nb_dpe: count ?? 0, derniere_verif_dpe: new Date().toISOString() })
        .eq('code_insee', code_insee)
    }

    return NextResponse.json({ nb_inserted: nbInserted, nb_audits: nbAudits, nb_matched: nbMatched, after: null, has_more: false, mode })
  }

  return NextResponse.json({ nb_inserted: nbInserted, nb_audits: nbAudits, nb_matched: 0, after: nextAfter, has_more: true, mode })
}
