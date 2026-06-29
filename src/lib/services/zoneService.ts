import { SupabaseClient } from '@supabase/supabase-js'
import { generateDensityZones, GeoPoint, DpeParams, DensityZone } from '@/lib/geo/densityZones'
import { nearestNeighborTSP } from '@/lib/geo/tsp'
import { pointsToPolygonWKT, hullToGeoJSON } from '@/lib/geo/convexHull'

const ZONE_COLORS = [
  '#E63946', '#2196F3', '#FF9800', '#4CAF50', '#9C27B0',
  '#00BCD4', '#795548', '#607D8B', '#F06292', '#AED581',
  '#FFD54F', '#4DB6AC',
]

export interface ZoneGenerationOptions {
  nb_zones: number
  capacite_cible: number
  rayon_metres: number
  exclure_commerces: boolean
  dpe_poids: number
  dpe_fenetre_mois: number
  poids_collectif: number
  dpe_seuil_inclusion: number
  dvf_poids: number
}

export interface GenerationResult {
  nb_zones: number
  nb_hors_zone: number
  nb_prospectables: number
  warnings: string[]
}

export class ZoneService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Génère et sauvegarde les zones de prospection pour un commercial
   */
  async generateAndSaveZones(userId: string, options: ZoneGenerationOptions): Promise<GenerationResult> {
    const { data: commercial } = await this.supabase
      .from('commerciaux').select('id').eq('id', userId).single()

    if (!commercial) throw new Error('Profil commercial non trouvé')

    const { data: communes } = await this.supabase
      .from('communes').select('code_insee').eq('commercial_id', commercial.id)

    if (!communes?.length) throw new Error('Aucune commune configurée')

    const codesInsee = communes.map((c: any) => c.code_insee)
    const adresses = await this.fetchAllProspectableAdresses(codesInsee, options.exclure_commerces)

    if (adresses.length === 0) throw new Error('Aucune adresse trouvée')

    const dpeMap  = await this.fetchDpeMap(codesInsee, options.dpe_poids, options.dpe_fenetre_mois)
    const bdnbMap = await this.fetchBdnbTypeMap(adresses)
    const dvfMap  = await this.fetchDvfDensityMap(codesInsee, options.dvf_poids)

    const points: GeoPoint[] = adresses.map((a: any) => {
      const bdnb    = bdnbMap.get(a.batiment_groupe_id)
      const dpe     = dpeMap.get(a.id)
      return {
        id:                  a.id,
        lat:                 a.lat,
        lon:                 a.lon,
        prospectable:        true,
        code_insee:          a.code_insee,
        type_bien:           a.type_bien ?? 'inconnu',
        type_batiment_bdnb:  bdnb?.type_batiment_dpe ?? null,
        // Signal transaction : DPE dans la fenêtre OU DPE connu dans la BDNB
        has_dpe:             (dpe != null) || (bdnb?.classe_bilan_dpe != null),
        dpe_chauds:          dpe?.chauds ?? 0,
        dpe_tiedes:          dpe?.tiedes ?? 0,
        dvf_score:           dvfMap.get(a.id) ?? 0,
      }
    })

    const dpeParams: DpeParams = {
      poids: options.dpe_poids,
      seuil_inclusion: options.dpe_seuil_inclusion,
      poids_collectif: options.poids_collectif
    }

    const { zones: densityZones, horsZone } = generateDensityZones(
      points, options.nb_zones, options.capacite_cible, options.rayon_metres, dpeParams, options.dvf_poids
    )

    const warnings: string[] = []

    if (densityZones.length > 0) {
      await this.saveSnapshotAndClearZones(userId, codesInsee)
      const insertWarnings = await this.insertGeneratedZones(userId, densityZones, options)
      warnings.push(...insertWarnings)
    }

    return {
      nb_zones: densityZones.length,
      nb_hors_zone: horsZone.length,
      nb_prospectables: adresses.length,
      warnings
    }
  }

  private async fetchAllProspectableAdresses(codesInsee: string[], exclureCommerces: boolean) {
    const adresses: any[] = []
    const batches = this.chunk(codesInsee, 5)

    for (const batchInsee of batches) {
      let from = 0
      while (true) {
        let query = this.supabase
          .from('adresses')
          .select('id, lat, lon, type_bien, prospectable, code_insee, batiment_groupe_id')
          .in('code_insee', batchInsee)
          .eq('prospectable', true)
          .neq('type_bien', 'logement_social')
          .range(from, from + 999)

        if (exclureCommerces) {
          query = query.neq('type_bien', 'commerce')
        }

        const { data, error } = await query
        if (error || !data || data.length === 0) break

        adresses.push(...data)
        if (data.length < 1000) break
        from += 1000
      }
    }
    return adresses
  }

  // Récupère le type BDNB (type_batiment_dpe, classe_bilan_dpe) pour chaque batiment_groupe_id
  private async fetchBdnbTypeMap(adresses: any[]): Promise<Map<string, { type_batiment_dpe: string | null; classe_bilan_dpe: string | null }>> {
    const map = new Map<string, { type_batiment_dpe: string | null; classe_bilan_dpe: string | null }>()
    const ids = [...new Set(adresses.map((a: any) => a.batiment_groupe_id).filter(Boolean))]
    if (ids.length === 0) return map

    const batches = this.chunk(ids, 500)
    for (const batch of batches) {
      const { data } = await this.supabase
        .from('bdnb_batiment_groupe')
        .select('batiment_groupe_id, type_batiment_dpe, classe_bilan_dpe')
        .in('batiment_groupe_id', batch)
      for (const row of (data ?? [])) {
        map.set(row.batiment_groupe_id, {
          type_batiment_dpe: row.type_batiment_dpe ?? null,
          classe_bilan_dpe:  row.classe_bilan_dpe  ?? null,
        })
      }
    }
    return map
  }

  private async fetchDpeMap(codesInsee: string[], dpePoids: number, dpeFenetreMois: number) {
    const dpeMap = new Map<string, { chauds: number; tiedes: number }>()
    if (dpePoids <= 0) return dpeMap

    const now = Date.now()
    const dpeWindowMs = dpeFenetreMois * 30 * 24 * 60 * 60 * 1000
    const extWindowMs = dpeFenetreMois * 2 * 30 * 24 * 60 * 60 * 1000
    const sinceDate = new Date(now - extWindowMs).toISOString().slice(0, 10)

    const batches = this.chunk(codesInsee, 5)

    for (const batchInsee of batches) {
      let from = 0
      while (true) {
        const { data: dpeRows, error } = await this.supabase
          .from('dpe_logement')
          .select('adresse_id, date_etablissement')
          .in('code_insee', batchInsee)
          .not('adresse_id', 'is', null)
          .gte('date_etablissement', sinceDate)
          .range(from, from + 999)

        if (error || !dpeRows || dpeRows.length === 0) break

        for (const dpe of dpeRows) {
          const ageMs = now - new Date(dpe.date_etablissement).getTime()
          const entry = dpeMap.get(dpe.adresse_id) ?? { chauds: 0, tiedes: 0 }
          if (ageMs <= dpeWindowMs) entry.chauds++
          else if (ageMs <= extWindowMs) entry.tiedes++
          dpeMap.set(dpe.adresse_id, entry)
        }

        if (dpeRows.length < 1000) break
        from += 1000
      }
    }
    return dpeMap
  }

  private async fetchDvfDensityMap(codesInsee: string[], dvfPoids: number): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (dvfPoids <= 0) return map

    const { data, error } = await this.supabase.rpc('dvf_density_per_address', {
      p_codes_insee: codesInsee,
      p_annees: 4,
    })

    if (error) {
      console.error('[ZoneService] dvf_density_per_address error:', error.message)
      return map
    }

    for (const row of (data ?? [])) {
      map.set(row.adresse_id, row.nb_dvf)
    }
    return map
  }

  private async saveSnapshotAndClearZones(userId: string, codesInsee: string[]) {
    const { data: existingFull } = await this.supabase
      .from('zones_prospection')
      .select('id, nom, numero, couleur, nb_adresses, nb_prospectables, capacite_theorique, polygone_geojson')
      .eq('commercial_id', userId)

    if (existingFull && existingFull.length > 0) {
      await this.supabase.from('zones_snapshots').insert({
        commercial_id: userId,
        nom: `Sauvegarde auto ${new Date().toLocaleDateString('fr-FR')} — ${existingFull.length} zones`,
        nb_zones: existingFull.length,
        zones_data: JSON.stringify(existingFull),
      })

      const { data: snapshots } = await this.supabase
        .from('zones_snapshots').select('id').eq('commercial_id', userId)
        .order('created_at', { ascending: false })

      if (snapshots && snapshots.length > 5) {
        await this.supabase.from('zones_snapshots').delete().in('id', snapshots.slice(5).map((s: any) => s.id))
      }

      const existingIds = existingFull.map((z: any) => z.id)
      await this.supabase.from('planning_sessions').update({ zone_id: null }).in('zone_id', existingIds)
      await this.supabase.from('zones_prospection').delete().in('id', existingIds)
    }

    const batches = this.chunk(codesInsee, 5)
    for (const batchInsee of batches) {
      await this.supabase.from('adresses').update({ zone_id: null }).in('code_insee', batchInsee)
    }
  }

  private async insertGeneratedZones(userId: string, densityZones: DensityZone[], options: ZoneGenerationOptions): Promise<string[]> {
    const insertedZoneIds: string[] = []
    const warnings: string[] = []

    for (let i = 0; i < densityZones.length; i++) {
      const dz = densityZones[i]
      const couleur = ZONE_COLORS[i % ZONE_COLORS.length]

      const orderedPts = nearestNeighborTSP(dz.points)
      const rawWKT = orderedPts.length >= 3 ? pointsToPolygonWKT(orderedPts.map(p => [p.lon, p.lat] as [number, number])) : null
      const rawHull = orderedPts.map(p => [p.lon, p.lat] as [number, number])
      const polygonGeoJSON = rawHull.length >= 3 ? JSON.stringify({ type: 'Polygon', coordinates: [hullToGeoJSON(rawHull)[0]] }) : null

      // Clipper le polygone contre les zones déjà insérées (ST_Difference via RPC)
      let polygonWKT: string | null = rawWKT
      if (rawWKT && insertedZoneIds.length > 0) {
        try {
          const { data: clipResult } = await this.supabase.rpc('clip_polygon_against_zones', {
            raw_wkt: rawWKT,
            zone_ids: insertedZoneIds,
          })
          if (clipResult) polygonWKT = clipResult
        } catch (e) {
          console.log('[ZONES] clip RPC non disponible')
        }
      }

      const { data: zone, error: zError } = await this.supabase
        .from('zones_prospection')
        .insert({
          commercial_id: userId,
          numero: i + 1,
          nom: `Zone ${i + 1}`,
          couleur,
          capacite_theorique: options.capacite_cible,
          nb_adresses: dz.points.length,
          nb_prospectables: dz.points.length,
          nb_dpe_chauds: dz.nb_dpe_chauds ?? 0,
          nb_dpe_tiedes: dz.nb_dpe_tiedes ?? 0,
          dpe_prioritaire: dz.dpe_prioritaire ?? false,
          statut: 'active',
          polygone: polygonWKT ?? null,
          polygone_geojson: polygonGeoJSON ?? null,
        })
        .select('id')
        .single()

      if (zError || !zone) {
        warnings.push(`Zone ${i + 1} : erreur insertion - ${zError?.message ?? 'inconnu'}`)
        continue
      }

      if (dz.rayon_metres > options.rayon_metres) {
        warnings.push(`Zone ${i + 1} : rayon étendu à ${dz.rayon_metres}m (${dz.points.length} adresses)`)
      }

      insertedZoneIds.push(zone.id)

      // Lien via IDs des points du clustering
      const adresseBatches = this.chunk(dz.points.map((p: any) => p.id), 100)
      for (const batch of adresseBatches) {
        await this.supabase.from('adresses').update({ zone_id: zone.id }).in('id', batch)
      }
      // Filet de sécurité : recalage PostGIS via polygone_geojson pour les adresses manquantes
      if (polygonGeoJSON) {
        try {
          await this.supabase.rpc('recalage_zone_geojson', {
            p_zone_id: zone.id,
            p_geojson: polygonGeoJSON,
          })
        } catch (_) {
          // RPC optionnelle — pas bloquant si absente
        }
      }
    }
    return warnings
  }

  private chunk<T>(arr: T[], n: number): T[][] {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n))
    return result
  }
}
