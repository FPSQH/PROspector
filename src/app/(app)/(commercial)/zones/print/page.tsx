import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface PrintZone {
  id: string
  nom: string
  numero: number
  couleur: string
  nb_adresses: number
  nb_prospectables: number
  nb_dpe_chauds: number
  adresses: Array<{ lat: number; lon: number; type_bien: string; has_commerce: boolean }>
}

function getMapUrl(adresses: Array<{ lat: number; lon: number }>, width = 700, height = 450): string {
  if (!adresses.length) return ''
  const lats = adresses.map(a => a.lat)
  const lons = adresses.map(a => a.lon)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons)
  const padLat = Math.max((latMax - latMin) * 0.25, 0.005)
  const padLon = Math.max((lonMax - lonMin) * 0.25, 0.005)
  const bbox = [lonMin - padLon, latMin - padLat, lonMax + padLon, latMax + padLat]
  return 'https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap' +
    '&LAYERS=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLES=&SRS=EPSG:4326' +
    '&BBOX=' + bbox.join(',') +
    '&WIDTH=' + width + '&HEIGHT=' + height + '&FORMAT=image/png'
}

function getSvgPoints(
  adresses: Array<{ lat: number; lon: number; type_bien: string }>,
  mapW = 700, mapH = 450
): string {
  if (!adresses.length) return ''
  const lats = adresses.map(a => a.lat)
  const lons = adresses.map(a => a.lon)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons)
  const padLat = Math.max((latMax - latMin) * 0.25, 0.005)
  const padLon = Math.max((lonMax - lonMin) * 0.25, 0.005)
  const bLat0 = latMin - padLat, bLat1 = latMax + padLat
  const bLon0 = lonMin - padLon, bLon1 = lonMax + padLon

  const colorMap: Record<string, string> = {
    maison: '#16a34a', appartement: '#2563eb', commerce: '#ea580c', inconnu: '#9ca3af',
  }

  return adresses.map(a => {
    const x = ((a.lon - bLon0) / (bLon1 - bLon0)) * mapW
    const y = mapH - ((a.lat - bLat0) / (bLat1 - bLat0)) * mapH
    const c = colorMap[a.type_bien] ?? '#9ca3af'
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="' + c + '" fill-opacity="0.85" stroke="white" stroke-width="1"/>'
  }).join('')
}

function StatRow({ icon, label, nb, total }: { icon: string; label: string; nb: number; total: number }) {
  const pct = total > 0 ? Math.round(nb / total * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 30, textAlign: 'right' }}>{nb}</span>
      <span style={{ fontSize: 12, color: '#888', minWidth: 40, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

export default async function PrintPage({
  searchParams,
}: {
  searchParams: { ids?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ids = (searchParams.ids ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!ids.length) redirect('/zones')

  // Charger les zones
  const { data: zonesRaw } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_adresses, nb_prospectables, nb_dpe_chauds')
    .in('id', ids)
    .eq('commercial_id', user.id)
    .order('numero')

  if (!zonesRaw?.length) redirect('/zones')

  // Charger les adresses par zone
  const zones: PrintZone[] = []
  for (const z of zonesRaw) {
    let adresses: any[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('adresses')
        .select('lat, lon, type_bien, has_commerce')
        .eq('zone_id', z.id)
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      adresses.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
    zones.push({ ...z, adresses })
  }

  const mapW = 700, mapH = 420

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <title>Zones de prospection — Impression</title>
        <style dangerouslySetInnerHTML={{ __html: `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, sans-serif; background: #fff; color: #1a1a18; }
          .zone-page {
            width: 210mm;
            min-height: 297mm;
            padding: 12mm 14mm;
            page-break-after: always;
            break-after: page;
          }
          .zone-page:last-child { page-break-after: avoid; break-after: avoid; }
          .map-container { position: relative; width: 100%; }
          .map-container img { display: block; width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; }
          .map-container svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
          .stats { margin-top: 10mm; }
          .print-btn {
            position: fixed; top: 16px; right: 16px; z-index: 999;
            padding: 10px 20px; background: #1D9E75; color: #fff;
            border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600;
          }
          @media print {
            .print-btn { display: none; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        ` }} />
      </head>
      <body>
        <button className="print-btn" onClick={() => window.print()}>🖨 Imprimer / PDF</button>

        {zones.map((zone) => {
          const mapUrl  = getMapUrl(zone.adresses, mapW, mapH)
          const svgPts  = getSvgPoints(zone.adresses, mapW, mapH)

          const nbMaison     = zone.adresses.filter(a => a.type_bien === 'maison').length
          const nbAppart     = zone.adresses.filter(a => a.type_bien === 'appartement').length
          const nbCommerce   = zone.adresses.filter(a => a.type_bien === 'commerce').length
          const nbInconnu    = zone.adresses.filter(a => !a.type_bien || a.type_bien === 'inconnu').length
          const total        = zone.adresses.length

          return (
            <div key={zone.id} className="zone-page">
              {/* En-tete */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, borderBottom: '2px solid ' + zone.couleur, paddingBottom: 8 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: zone.couleur, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 700 }}>{zone.nom}</h1>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {total} adresses prospectables
                    {zone.nb_dpe_chauds > 0 && (
                      <span style={{ marginLeft: 12, color: '#dc2626', fontWeight: 600 }}>
                        📋 {zone.nb_dpe_chauds} DPE &lt; 6 mois
                      </span>
                    )}
                  </p>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
                  <div>PROspector</div>
                  <div>{new Date().toLocaleDateString('fr-FR')}</div>
                </div>
              </div>

              {/* Carte */}
              {mapUrl && (
                <div className="map-container" style={{ marginBottom: 6 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mapUrl} alt={'Carte ' + zone.nom} width={mapW} height={mapH} />
                  <svg viewBox={'0 0 ' + mapW + ' ' + mapH} dangerouslySetInnerHTML={{ __html: svgPts }} />
                </div>
              )}

              {/* Legende carte */}
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginBottom: 8, flexWrap: 'wrap' }}>
                <span><span style={{ color: '#16a34a' }}>●</span> Maison</span>
                <span><span style={{ color: '#2563eb' }}>●</span> Appartement</span>
                <span><span style={{ color: '#ea580c' }}>●</span> Commerce</span>
                <span><span style={{ color: '#9ca3af' }}>●</span> Non qualifie</span>
              </div>

              {/* Stats */}
              <div className="stats">
                <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#374151' }}>
                  Composition de la zone
                </h2>
                <StatRow icon="🏠" label="Habitat individuel (maison)"     nb={nbMaison}   total={total} />
                <StatRow icon="🏢" label="Habitat collectif (appartement)" nb={nbAppart}   total={total} />
                <StatRow icon="🏪" label="Commerce / Local"                nb={nbCommerce} total={total} />
                <StatRow icon="❓" label="Non qualifie"                    nb={nbInconnu}  total={total} />

                {zone.nb_dpe_chauds > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                    <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                      📋 {zone.nb_dpe_chauds} DPE realises dans les 6 derniers mois
                    </span>
                    <span style={{ fontSize: 12, color: '#b91c1c', marginLeft: 8 }}>
                      ({total > 0 ? Math.round(zone.nb_dpe_chauds / total * 100) : 0}% des adresses)
                      — Signal commercial fort
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </body>
    </html>
  )
}
