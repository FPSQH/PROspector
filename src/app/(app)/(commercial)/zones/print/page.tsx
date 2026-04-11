'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface PrintZone {
  id: string
  nom: string
  numero: number
  couleur: string
  nb_adresses: number
  nb_prospectables: number
  nb_dpe_chauds: number
  adresses: Array<{ lat: number; lon: number; type_bien: string }>
}

function getMapUrl(adresses: Array<{ lat: number; lon: number }>, width = 680, height = 400): string {
  if (!adresses.length) return ''
  const lats = adresses.map(a => a.lat)
  const lons = adresses.map(a => a.lon)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons)
  const padLat = Math.max((latMax - latMin) * 0.25, 0.005)
  const padLon = Math.max((lonMax - lonMin) * 0.25, 0.005)
  const bbox = [lonMin-padLon, latMin-padLat, lonMax+padLon, latMax+padLat].map(v => v.toFixed(6)).join(',')
  // Proxy serveur pour eviter les blocages CORS/Referer sur IGN
  return '/api/map-tile?bbox=' + bbox + '&width=' + width + '&height=' + height
}

function getSvgPoints(adresses: Array<{ lat: number; lon: number; type_bien: string }>, mapW = 680, mapH = 400): string {
  if (!adresses.length) return ''
  const lats = adresses.map(a => a.lat)
  const lons = adresses.map(a => a.lon)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons)
  const padLat = Math.max((latMax - latMin) * 0.25, 0.005)
  const padLon = Math.max((lonMax - lonMin) * 0.25, 0.005)
  const bLat0 = latMin-padLat, bLat1 = latMax+padLat
  const bLon0 = lonMin-padLon, bLon1 = lonMax+padLon
  const colorMap: Record<string, string> = {
    maison: '#16a34a', appartement: '#2563eb', commerce: '#ea580c', inconnu: '#9ca3af'
  }
  return adresses.map(a => {
    const x = ((a.lon - bLon0) / (bLon1 - bLon0)) * mapW
    const y = mapH - ((a.lat - bLat0) / (bLat1 - bLat0)) * mapH
    const c = colorMap[a.type_bien] ?? '#9ca3af'
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="' + c + '" fill-opacity="0.85" stroke="white" stroke-width="1.2"/>'
  }).join('')
}

function PrintContent() {
  const searchParams = useSearchParams()
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean)
  const [zones, setZones] = useState<PrintZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ids.length) { setError('Aucune zone selectionnee'); setLoading(false); return }
    fetch('/api/zones/print-data?ids=' + ids.join(','))
      .then(r => r.json())
      .then(data => { setZones(data.zones ?? []); setLoading(false) })
      .catch(() => { setError('Erreur de chargement'); setLoading(false) })
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div>Chargement des zones...</div>
    </div>
  )
  if (error) return <div style={{ padding: 40, fontFamily: 'sans-serif', color: 'red' }}>{error}</div>

  const today = new Date().toLocaleDateString('fr-FR')

  return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#fff' }}>
      {/* Bouton impression (masque a l impression) */}
      <div className="no-print" style={{
        position: 'fixed', top: 16, right: 16, zIndex: 999, display: 'flex', gap: 10
      }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 20px', background: '#1D9E75', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600
          }}
        >
          🖨 Imprimer / PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{
            padding: '10px 16px', background: '#fff', color: '#6b7280',
            border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 14
          }}
        >
          Fermer
        </button>
      </div>

      <style>{zonePageCSS}</style>

      {zones.map((zone) => {
        const mapUrl = getMapUrl(zone.adresses)
        const svgPts = getSvgPoints(zone.adresses)
        const mapW = 680, mapH = 400
        const nbMaison   = zone.adresses.filter(a => a.type_bien === 'maison').length
        const nbAppart   = zone.adresses.filter(a => a.type_bien === 'appartement').length
        const nbCommerce = zone.adresses.filter(a => a.type_bien === 'commerce').length
        const nbInconnu  = zone.adresses.filter(a => !a.type_bien || a.type_bien === 'inconnu').length
        const total      = zone.adresses.length

        return (
          <div key={zone.id} className="zone-page">
            {/* En-tete */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8, borderBottom: '2px solid ' + zone.couleur, paddingBottom: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: zone.couleur, marginTop: 3, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{zone.nom}</h1>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '3px 0 0' }}>
                  {total} adresses prospectables
                  {zone.nb_dpe_chauds > 0 && (
                    <span style={{ marginLeft: 14, color: '#dc2626', fontWeight: 600 }}>
                      📋 {zone.nb_dpe_chauds} DPE &lt; 6 mois
                    </span>
                  )}
                </p>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 600 }}>PROspector</div>
                <div>{today}</div>
              </div>
            </div>

            {/* Carte + overlay SVG */}
            {mapUrl && (
              <div style={{ position: 'relative', marginBottom: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mapUrl} alt={'Carte ' + zone.nom} width={mapW} height={mapH}
                  style={{ display: 'block', width: '100%', border: '1px solid #e5e7eb', borderRadius: 6 }} />
                <svg viewBox={'0 0 ' + mapW + ' ' + mapH}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  dangerouslySetInnerHTML={{ __html: svgPts }} />
              </div>
            )}

            {/* Legende */}
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginBottom: 10, flexWrap: 'wrap' }}>
              <span><span style={{ color: '#16a34a' }}>●</span> Maison</span>
              <span><span style={{ color: '#2563eb' }}>●</span> Appartement</span>
              <span><span style={{ color: '#ea580c' }}>●</span> Commerce</span>
              <span><span style={{ color: '#9ca3af' }}>●</span> Non qualifie</span>
            </div>

            {/* Stats */}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#374151' }}>Composition de la zone</h2>
              {[
                { icon: '🏠', label: 'Habitat individuel (maison)',     nb: nbMaison   },
                { icon: '🏢', label: 'Habitat collectif (appartement)', nb: nbAppart   },
                { icon: '🏪', label: 'Commerce / Local',                nb: nbCommerce },
                { icon: '❓', label: 'Non qualifie',                    nb: nbInconnu  },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: 16 }}>{row.icon}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{row.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, minWidth: 28, textAlign: 'right' }}>{row.nb}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 38, textAlign: 'right' }}>{total > 0 ? Math.round(row.nb/total*100) : 0}%</span>
                </div>
              ))}
              {zone.nb_dpe_chauds > 0 && (
                <div style={{ marginTop: 8, padding: '7px 12px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                  <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                    📋 {zone.nb_dpe_chauds} DPE realises dans les 6 derniers mois
                  </span>
                  <span style={{ fontSize: 12, color: '#b91c1c', marginLeft: 8 }}>
                    ({total > 0 ? Math.round(zone.nb_dpe_chauds/total*100) : 0}% des adresses) — Signal commercial fort
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const zonePageCSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; }
  .zone-page {
    width: 210mm; min-height: 297mm;
    padding: 12mm 14mm;
    page-break-after: always; break-after: page;
  }
  .zone-page:last-child { page-break-after: avoid; break-after: avoid; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

export default function PrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Chargement...</div>}>
      <PrintContent />
    </Suspense>
  )
}
