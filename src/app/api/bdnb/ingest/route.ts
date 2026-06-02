import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

// ══════════════════════════════════════════════════════════════════
// POST /api/bdnb/ingest
//
// Ingestion BDNB complète pour une commune.
// Récupère tous les bâtiments depuis l'API Open BDNB (PostgREST),
// convertit les centroïdes Lambert-93 → WGS84, et upsert en base.
//
// Body : { code_insee, nom, commune_id }
// Retourne : { ok, count }
// ══════════════════════════════════════════════════════════════════

const BDNB_BASE = 'https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet'
const LIMIT     = 10   // API BDNB Open sans clé : max 10 par page
const BATCH_SIZE = 200

// ── Conversion Lambert-93 (EPSG:2154) → WGS84 ────────────────────
// Formule IGN NTG_71, validée sur Tréguier/Paris/Marseille
function lambert93ToWgs84(X: number, Y: number): { lat: number; lon: number } | null {
  const n  = 0.7256077650532670
  const C  = 11754255.4260960990
  const Xs = 700000.0
  const Ys = 12655612.0499
  const e  = 0.0818191910428158

  const dX = X - Xs
  const dY = Y - Ys
  const R  = Math.sqrt(dX * dX + dY * dY)
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

// ── Calcule le centroïde d'un GeoJSON MultiPolygon (Lambert-93) ───
// Prend la première ring du premier polygone et fait la moyenne X/Y
function computeCentroidLambert(geom: any): { X: number; Y: number } | null {
  try {
    let coords: number[][] | null = null

    if (geom?.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      coords = geom.coordinates[0]?.[0] ?? null
    } else if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      coords = geom.coordinates[0] ?? null
    } else if (geom?.type === 'Point' && Array.isArray(geom.coordinates)) {
      return { X: geom.coordinates[0], Y: geom.coordinates[1] }
    }

    if (!coords || coords.length === 0) return null

    let sumX = 0, sumY = 0
    for (const pt of coords) {
      sumX += pt[0]
      sumY += pt[1]
    }
    return { X: sumX / coords.length, Y: sumY / coords.length }
  } catch {
    return null
  }
}

// ── Fetch une page BDNB ───────────────────────────────────────────
async function fetchBdnbPage(code_insee: string, offset: number): Promise<any[]> {
  const url = `${BDNB_BASE}?code_commune_insee=eq.${encodeURIComponent(code_insee)}&limit=${LIMIT}&offset=${offset}`
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`BDNB API HTTP ${resp.status}`)
  const data = await resp.json()
  // PostgREST returns an array directly
  return Array.isArray(data) ? data : []
}

// ── Mappe un enregistrement BDNB vers la ligne DB ─────────────────
function mapRow(r: any): Record<string, any> {
  // Résoudre le centroïde Lambert-93 → WGS84
  let lat_centre: number | null = null
  let lon_centre: number | null = null

  const centroid = computeCentroidLambert(r.geom_groupe)
  if (centroid) {
    const wgs = lambert93ToWgs84(centroid.X, centroid.Y)
    if (wgs) { lat_centre = wgs.lat; lon_centre = wgs.lon }
  }

  return {
    batiment_groupe_id:                          r.batiment_groupe_id ?? null,
    code_commune_insee:                          r.code_commune_insee ?? null,
    code_departement_insee:                      r.code_departement_insee ?? null,
    code_epci_insee:                             r.code_epci_insee ?? null,
    code_iris:                                   r.code_iris ?? null,
    code_region_insee:                           r.code_region_insee ?? null,
    libelle_commune_insee:                       r.libelle_commune_insee ?? null,
    commune_parente:                             r.commune_parente ?? null,
    libelle_adr_principale_ban:                  r.libelle_adr_principale_ban ?? null,
    cle_interop_adr_principale_ban:              r.cle_interop_adr_principale_ban ?? null,
    l_cle_interop_adr:                           r.l_cle_interop_adr ?? null,
    l_libelle_adr:                               r.l_libelle_adr ?? null,
    l_parcelle_id:                               r.l_parcelle_id ?? null,
    l_denomination_proprietaire:                 r.l_denomination_proprietaire ?? null,
    l_siren:                                     r.l_siren ?? null,
    nb_adresse_valid_ban:                        r.nb_adresse_valid_ban != null ? Number(r.nb_adresse_valid_ban) : null,
    numero_immat_principal:                      r.numero_immat_principal ?? null,
    geom_groupe:                                 r.geom_groupe ?? null,
    s_geom_groupe:                               r.s_geom_groupe != null ? Number(r.s_geom_groupe) : null,
    lat_centre,
    lon_centre,
    geom_centre: (lat_centre != null && lon_centre != null)
      ? `SRID=4326;POINT(${lon_centre} ${lat_centre})`
      : null,
    usage_principal_bdnb_open:                   r.usage_principal_bdnb_open ?? null,
    usage_niveau_1_txt:                          r.usage_niveau_1_txt ?? null,
    type_batiment_dpe:                           r.type_batiment_dpe ?? null,
    annee_construction:                          r.annee_construction != null ? Number(r.annee_construction) : null,
    annee_construction_dpe:                      r.annee_construction_dpe != null ? Number(r.annee_construction_dpe) : null,
    nb_log:                                      r.nb_log != null ? Number(r.nb_log) : null,
    nb_log_rnc:                                  r.nb_log_rnc != null ? Number(r.nb_log_rnc) : null,
    nb_lot_garpark_rnc:                          r.nb_lot_garpark_rnc != null ? Number(r.nb_lot_garpark_rnc) : null,
    nb_lot_tertiaire_rnc:                        r.nb_lot_tertiaire_rnc != null ? Number(r.nb_lot_tertiaire_rnc) : null,
    surface_emprise_sol:                         r.surface_emprise_sol != null ? Number(r.surface_emprise_sol) : null,
    hauteur_mean:                                r.hauteur_mean != null ? Number(r.hauteur_mean) : null,
    nb_niveau:                                   r.nb_niveau != null ? Number(r.nb_niveau) : null,
    altitude_sol_mean:                           r.altitude_sol_mean != null ? Number(r.altitude_sol_mean) : null,
    traversant:                                  r.traversant ?? null,
    presence_balcon:                             r.presence_balcon ?? null,
    contient_fictive_geom_groupe:                r.contient_fictive_geom_groupe ?? null,
    croisement_geospx_reussi:                    r.croisement_geospx_reussi ?? null,
    classe_bilan_dpe:                            r.classe_bilan_dpe ?? null,
    classe_conso_energie_arrete_2012:            r.classe_conso_energie_arrete_2012 ?? null,
    classe_conso_energie_dpe_tertiaire:          r.classe_conso_energie_dpe_tertiaire ?? null,
    classe_inertie:                              r.classe_inertie ?? null,
    arrete_2021:                                 r.arrete_2021 ?? null,
    identifiant_dpe:                             r.identifiant_dpe ?? null,
    date_reception_dpe:                          r.date_reception_dpe ?? null,
    type_dpe:                                    r.type_dpe ?? null,
    conso_5_usages_ep_m2:                        r.conso_5_usages_ep_m2 != null ? Number(r.conso_5_usages_ep_m2) : null,
    conso_3_usages_ep_m2_arrete_2012:            r.conso_3_usages_ep_m2_arrete_2012 != null ? Number(r.conso_3_usages_ep_m2_arrete_2012) : null,
    emission_ges_5_usages_m2:                    r.emission_ges_5_usages_m2 != null ? Number(r.emission_ges_5_usages_m2) : null,
    emission_ges_3_usages_ep_m2_arrete_2012:     r.emission_ges_3_usages_ep_m2_arrete_2012 != null ? Number(r.emission_ges_3_usages_ep_m2_arrete_2012) : null,
    nb_classe_bilan_dpe_a:                       r.nb_classe_bilan_dpe_a != null ? Number(r.nb_classe_bilan_dpe_a) : null,
    nb_classe_bilan_dpe_b:                       r.nb_classe_bilan_dpe_b != null ? Number(r.nb_classe_bilan_dpe_b) : null,
    nb_classe_bilan_dpe_c:                       r.nb_classe_bilan_dpe_c != null ? Number(r.nb_classe_bilan_dpe_c) : null,
    nb_classe_bilan_dpe_d:                       r.nb_classe_bilan_dpe_d != null ? Number(r.nb_classe_bilan_dpe_d) : null,
    nb_classe_bilan_dpe_e:                       r.nb_classe_bilan_dpe_e != null ? Number(r.nb_classe_bilan_dpe_e) : null,
    nb_classe_bilan_dpe_f:                       r.nb_classe_bilan_dpe_f != null ? Number(r.nb_classe_bilan_dpe_f) : null,
    nb_classe_bilan_dpe_g:                       r.nb_classe_bilan_dpe_g != null ? Number(r.nb_classe_bilan_dpe_g) : null,
    nb_classe_conso_energie_arrete_2012_a:       r.nb_classe_conso_energie_arrete_2012_a != null ? Number(r.nb_classe_conso_energie_arrete_2012_a) : null,
    nb_classe_conso_energie_arrete_2012_b:       r.nb_classe_conso_energie_arrete_2012_b != null ? Number(r.nb_classe_conso_energie_arrete_2012_b) : null,
    nb_classe_conso_energie_arrete_2012_c:       r.nb_classe_conso_energie_arrete_2012_c != null ? Number(r.nb_classe_conso_energie_arrete_2012_c) : null,
    nb_classe_conso_energie_arrete_2012_d:       r.nb_classe_conso_energie_arrete_2012_d != null ? Number(r.nb_classe_conso_energie_arrete_2012_d) : null,
    nb_classe_conso_energie_arrete_2012_e:       r.nb_classe_conso_energie_arrete_2012_e != null ? Number(r.nb_classe_conso_energie_arrete_2012_e) : null,
    nb_classe_conso_energie_arrete_2012_f:       r.nb_classe_conso_energie_arrete_2012_f != null ? Number(r.nb_classe_conso_energie_arrete_2012_f) : null,
    nb_classe_conso_energie_arrete_2012_g:       r.nb_classe_conso_energie_arrete_2012_g != null ? Number(r.nb_classe_conso_energie_arrete_2012_g) : null,
    nb_classe_conso_energie_arrete_2012_nc:      r.nb_classe_conso_energie_arrete_2012_nc != null ? Number(r.nb_classe_conso_energie_arrete_2012_nc) : null,
    conso_res_dle_elec_2020:                     r.conso_res_dle_elec_2020 != null ? Number(r.conso_res_dle_elec_2020) : null,
    conso_res_dle_gaz_2020:                      r.conso_res_dle_gaz_2020 != null ? Number(r.conso_res_dle_gaz_2020) : null,
    conso_pro_dle_elec_2020:                     r.conso_pro_dle_elec_2020 != null ? Number(r.conso_pro_dle_elec_2020) : null,
    conso_pro_dle_gaz_2020:                      r.conso_pro_dle_gaz_2020 != null ? Number(r.conso_pro_dle_gaz_2020) : null,
    nb_pdl_res_dle_elec_2020:                    r.nb_pdl_res_dle_elec_2020 != null ? Number(r.nb_pdl_res_dle_elec_2020) : null,
    nb_pdl_res_dle_gaz_2020:                     r.nb_pdl_res_dle_gaz_2020 != null ? Number(r.nb_pdl_res_dle_gaz_2020) : null,
    nb_pdl_pro_dle_elec_2020:                    r.nb_pdl_pro_dle_elec_2020 != null ? Number(r.nb_pdl_pro_dle_elec_2020) : null,
    nb_pdl_pro_dle_gaz_2020:                     r.nb_pdl_pro_dle_gaz_2020 != null ? Number(r.nb_pdl_pro_dle_gaz_2020) : null,
    mat_mur_txt:                                 r.mat_mur_txt ?? null,
    mat_toit_txt:                                r.mat_toit_txt ?? null,
    materiaux_structure_mur_exterieur:           r.materiaux_structure_mur_exterieur ?? null,
    type_isolation_mur_exterieur:                r.type_isolation_mur_exterieur ?? null,
    type_isolation_plancher_bas:                 r.type_isolation_plancher_bas ?? null,
    type_isolation_plancher_haut:                r.type_isolation_plancher_haut ?? null,
    type_plancher_bas_deperditif:                r.type_plancher_bas_deperditif ?? null,
    type_plancher_haut_deperditif:               r.type_plancher_haut_deperditif ?? null,
    type_materiaux_menuiserie:                   r.type_materiaux_menuiserie ?? null,
    type_fermeture:                              r.type_fermeture ?? null,
    type_vitrage:                                r.type_vitrage ?? null,
    type_gaz_lame:                               r.type_gaz_lame ?? null,
    vitrage_vir:                                 r.vitrage_vir ?? null,
    epaisseur_lame:                              r.epaisseur_lame != null ? Number(r.epaisseur_lame) : null,
    facteur_solaire_baie_vitree:                 r.facteur_solaire_baie_vitree != null ? Number(r.facteur_solaire_baie_vitree) : null,
    pourcentage_surface_baie_vitree_exterieur:   r.pourcentage_surface_baie_vitree_exterieur != null ? Number(r.pourcentage_surface_baie_vitree_exterieur) : null,
    l_orientation_baie_vitree:                   r.l_orientation_baie_vitree ?? null,
    u_baie_vitree:                               r.u_baie_vitree != null ? Number(r.u_baie_vitree) : null,
    u_mur_exterieur:                             r.u_mur_exterieur != null ? Number(r.u_mur_exterieur) : null,
    u_plancher_bas_final_deperditif:             r.u_plancher_bas_final_deperditif != null ? Number(r.u_plancher_bas_final_deperditif) : null,
    u_plancher_haut_deperditif:                  r.u_plancher_haut_deperditif != null ? Number(r.u_plancher_haut_deperditif) : null,
    uw:                                          r.uw != null ? Number(r.uw) : null,
    type_installation_chauffage:                 r.type_installation_chauffage ?? null,
    nb_installation_chauffage:                   r.nb_installation_chauffage != null ? Number(r.nb_installation_chauffage) : null,
    type_installation_ecs:                       r.type_installation_ecs ?? null,
    nb_installation_ecs:                         r.nb_installation_ecs != null ? Number(r.nb_installation_ecs) : null,
    type_energie_chauffage:                      r.type_energie_chauffage ?? null,
    type_energie_chauffage_appoint:              r.type_energie_chauffage_appoint ?? null,
    type_energie_chauffage_tertiaire:            r.type_energie_chauffage_tertiaire ?? null,
    type_generateur_chauffage:                   r.type_generateur_chauffage ?? null,
    type_generateur_chauffage_anciennete:        r.type_generateur_chauffage_anciennete ?? null,
    type_generateur_chauffage_appoint:           r.type_generateur_chauffage_appoint ?? null,
    type_generateur_chauffage_anciennete_appoint: r.type_generateur_chauffage_anciennete_appoint ?? null,
    type_generateur_ecs:                         r.type_generateur_ecs ?? null,
    type_generateur_ecs_anciennete:              r.type_generateur_ecs_anciennete ?? null,
    type_generateur_ecs_appoint:                 r.type_generateur_ecs_appoint ?? null,
    type_generateur_ecs_anciennete_appoint:      r.type_generateur_ecs_anciennete_appoint ?? null,
    type_generateur_climatisation:               r.type_generateur_climatisation ?? null,
    type_generateur_climatisation_anciennete:    r.type_generateur_climatisation_anciennete ?? null,
    type_ventilation:                            r.type_ventilation ?? null,
    chauffage_solaire:                           r.chauffage_solaire ?? null,
    ecs_solaire:                                 r.ecs_solaire ?? null,
    type_production_energie_renouvelable:        r.type_production_energie_renouvelable ?? null,
    methode_application_dpe_tertiaire:           r.methode_application_dpe_tertiaire ?? null,
    denomination_monument_historique:            r.denomination_monument_historique ?? null,
    nom_batiment_historique_plus_proche:         r.nom_batiment_historique_plus_proche ?? null,
    distance_monument_historique:                r.distance_monument_historique != null ? Number(r.distance_monument_historique) : null,
    distance_batiment_historique_plus_proche:    r.distance_batiment_historique_plus_proche != null ? Number(r.distance_batiment_historique_plus_proche) : null,
    perimetre_bat_historique:                    r.perimetre_bat_historique ?? null,
    zone_plu_bati_patrimonial:                   r.zone_plu_bati_patrimonial ?? null,
    contrainte_urbanisme_ac1:                    r.contrainte_urbanisme_ac1 ?? null,
    alea_argile:                                 r.alea_argile ?? null,
    alea_argiles:                                r.alea_argiles ?? null,
    quartier_prioritaire:                        r.quartier_prioritaire ?? null,
    nom_qp:                                      r.nom_qp ?? null,
    nom_quartier_qpv:                            r.nom_quartier_qpv ?? null,
    code_qp:                                     r.code_qp ?? null,
    id_reseau:                                   r.id_reseau ?? null,
    indicateur_distance_au_reseau:               r.indicateur_distance_au_reseau ?? null,
    valeur_fonciere_m2_residentiel_rel_commune:  r.valeur_fonciere_m2_residentiel_rel_commune != null ? Number(r.valeur_fonciere_m2_residentiel_rel_commune) : null,
    fiabilite_cr_adr_niv_1:                      r.fiabilite_cr_adr_niv_1 ?? null,
    fiabilite_cr_adr_niv_2:                      r.fiabilite_cr_adr_niv_2 ?? null,
    fiabilite_emprise_sol:                       r.fiabilite_emprise_sol ?? null,
    fiabilite_hauteur:                           r.fiabilite_hauteur ?? null,
    source:                                      'BDNB',
    updated_at:                                  new Date().toISOString(),
  }
}

// ── Route principale ──────────────────────────────────────────────
export async function POST(request: Request) {
  // Auth : session cookie utilisateur OU x-internal-key (appels internes)
  const key = request.headers.get('x-internal-key')
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user && key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.code_insee) {
    return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })
  }

  const { code_insee, nom = code_insee } = body

  const supabase = createAdminClientDirect<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    console.log(`[BDNB] Ingestion ${nom} (${code_insee})...`)

    // ── Pagination complète ───────────────────────────────────────
    const allRows: any[] = []
    let offset = 0

    while (true) {
      const page = await fetchBdnbPage(code_insee, offset)
      allRows.push(...page)
      if (page.length < LIMIT) break
      offset += LIMIT
<<<<<<< HEAD
=======
      // Petite pause pour respecter le rate limit de l'API Open
      await new Promise(r => setTimeout(r, 200))
>>>>>>> origin/claude/dazzling-ritchie-BfB7a
    }

    console.log(`[BDNB] ${allRows.length} bâtiments récupérés pour ${nom}`)

    if (allRows.length === 0) {
      return NextResponse.json({ ok: true, count: 0 })
    }

    // ── Upsert en batches de 200 ──────────────────────────────────
    let count = 0
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE).map(mapRow).filter(r => r.batiment_groupe_id)
      if (batch.length === 0) continue
      const { error } = await supabase
        .from('bdnb_batiment_groupe')
        .upsert(batch as any[], { onConflict: 'batiment_groupe_id', ignoreDuplicates: false })
      if (error) {
        console.error(`[BDNB] Erreur batch offset ${i}:`, error.message)
      } else {
        count += batch.length
      }
    }

    console.log(`[BDNB] ✓ ${count} bâtiments insérés pour ${nom}`)
    return NextResponse.json({ ok: true, count })

  } catch (err: any) {
    console.error(`[BDNB] Erreur:`, err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
