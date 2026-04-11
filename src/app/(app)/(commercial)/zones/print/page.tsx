'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface PrintZone {
  id: string; nom: string; numero: number; couleur: string
  nb_adresses: number; nb_prospectables: number; nb_dpe_chauds: number
  adresses: Array<{ lat: number; lon: number; type_bien: string }>
}

// ── Helpers tuiles OSM ───────────────────────────────────────────────────
function lat2tile(lat: number, z: number) { return Math.floor((1 - Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 * Math.pow(2,z)) }
function lon2tile(lon: number, z: number) { return Math.floor((lon+180)/360 * Math.pow(2,z)) }
function tile2lon(x: number, z: number)  { return x/Math.pow(2,z)*360-180 }
function tile2lat(y: number, z: number)  { const n=Math.PI-2*Math.PI*y/Math.pow(2,z); return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))) }

function getBestZoom(latMin: number, latMax: number, lonMin: number, lonMax: number, mapW: number): number {
  for (let z = 16; z >= 10; z--) {
    const xMin = lon2tile(lonMin, z), xMax = lon2tile(lonMax, z)
    if ((xMax - xMin + 1) <= Math.ceil(mapW / 256) + 1) return z
  }
  return 13
}

function loadTile(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function drawMap(
  canvas: HTMLCanvasElement,
  adresses: Array<{ lat: number; lon: number; type_bien: string }>,
  mapW: number, mapH: number
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const lats = adresses.map(a => a.lat)
  const lons = adresses.map(a => a.lon)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons)
  const padLat = Math.max((latMax-latMin)*0.3, 0.006)
  const padLon = Math.max((lonMax-lonMin)*0.3, 0.006)
  const bLat0 = latMin-padLat, bLat1 = latMax+padLat
  const bLon0 = lonMin-padLon, bLon1 = lonMax+padLon
  const cLat = (bLat0+bLat1)/2, cLon = (bLon0+bLon1)/2

  const zoom = getBestZoom(bLat0, bLat1, bLon0, bLon1, mapW)

  // Tuile centrale
  const tileSize = 256
  const cTX = lon2tile(cLon, zoom), cTY = lat2tile(cLat, zoom)
  const tilesH = Math.ceil(mapH/tileSize)+2
  const tilesW = Math.ceil(mapW/tileSize)+2

  // Origine en pixels de la tuile centrale par rapport au coin haut-gauche du canvas
  const cTLon = tile2lon(cTX, zoom), cTLat = tile2lat(cTY, zoom)
  const lonPerPx = (tile2lon(cTX+1,zoom)-cTLon)/tileSize
  const latPerPx = (cTLat-tile2lat(cTY+1,zoom))/tileSize
  const offsetX  = Math.round((cTLon-cLon)/lonPerPx + mapW/2)
  const offsetY  = Math.round((cTLat-cLat)/latPerPx + mapH/2)

  // Fond blanc
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, 0, mapW, mapH)

  // Charger et dessiner les tuiles
  const startX = cTX - Math.floor(tilesW/2)
  const startY = cTY - Math.floor(tilesH/2)
  const promises = []
  for (let dy = 0; dy < tilesH; dy++) {
    for (let dx = 0; dx < tilesW; dx++) {
      const tx = startX + dx, ty = startY + dy
      const px = offsetX + (tx-cTX)*tileSize
      const py = offsetY + (ty-cTY)*tileSize
      if (px+tileSize < 0 || px > mapW || py+tileSize < 0 || py > mapH) continue
      const url = 'https://tile.openstreetmap.org/' + zoom + '/' + tx + '/' + ty + '.png'
      promises.push(loadTile(url).then(img => ctx.drawImage(img, px, py, tileSize, tileSize)).catch(() => {}))
    }
  }
  await Promise.all(promises)

  // Dessiner les points d'adresses
  const colorMap: Record<string,string> = { maison:'#16a34a', appartement:'#2563eb', commerce:'#ea580c', inconnu:'#9ca3af' }
  for (const a of adresses) {
    const px = Math.round((a.lon-bLon0)/(bLon1-bLon0)*mapW)
    const py = Math.round((1-(a.lat-bLat0)/(bLat1-bLat0))*mapH)
    if (px < 0 || px > mapW || py < 0 || py > mapH) continue
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2)
    ctx.fillStyle = colorMap[a.type_bien] ?? '#9ca3af'
    ctx.fill()
    ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke()
  }
}

// ── Composant carte par zone ─────────────────────────────────────────────
function ZoneMap({ zone, mapW, mapH }: { zone: PrintZone; mapW: number; mapH: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvasRef.current && zone.adresses.length) drawMap(canvasRef.current, zone.adresses, mapW, mapH)
  }, [zone])
  return <canvas ref={canvasRef} width={mapW} height={mapH} style={{ width:'100%', border:'1px solid #e5e7eb', borderRadius:6, display:'block' }} />
}

// ── Page principale ──────────────────────────────────────────────────────
function PrintContent() {
  const searchParams = useSearchParams()
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean)
  const [zones, setZones]   = useState<PrintZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!ids.length) { setError('Aucune zone selectionnee'); setLoading(false); return }
    fetch('/api/zones/print-data?ids=' + ids.join(','))
      .then(r => r.json())
      .then(d => { setZones(d.zones ?? []); setLoading(false) })
      .catch(() => { setError('Erreur de chargement'); setLoading(false) })
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'sans-serif', color:'#6b7280' }}>
      Chargement des zones...
    </div>
  )
  if (error) return <div style={{ padding:40, color:'red' }}>{error}</div>

  const today = new Date().toLocaleDateString('fr-FR')
  const mapW = 680, mapH = 380

  return (
    <div style={{ fontFamily:'-apple-system,sans-serif', background:'#fff' }}>
      <style>{`
        @media print {
          .no-print { display:none!important; }
          body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        }
        .zone-page {
          width:210mm; min-height:297mm; padding:12mm 14mm;
          page-break-after:always; break-after:page;
        }
        .zone-page:last-child { page-break-after:avoid; break-after:avoid; }
        .stat-row { display:flex; align-items:center; gap:10px; padding:5px 0; border-bottom:1px solid #f0f0f0; }
      `}</style>

      <div className="no-print" style={{ position:'fixed', top:16, right:16, zIndex:999, display:'flex', gap:10 }}>
        <button onClick={() => window.print()} style={{ padding:'10px 20px', background:'#1D9E75', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:14, fontWeight:600 }}>
          🖨 Imprimer / PDF
        </button>
        <button onClick={() => window.close()} style={{ padding:'10px 16px', background:'#fff', color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:8, cursor:'pointer', fontSize:14 }}>
          Fermer
        </button>
      </div>

      {zones.map(zone => {
        const nbMaison   = zone.adresses.filter(a => a.type_bien==='maison').length
        const nbAppart   = zone.adresses.filter(a => a.type_bien==='appartement').length
        const nbCommerce = zone.adresses.filter(a => a.type_bien==='commerce').length
        const nbInconnu  = zone.adresses.filter(a => !a.type_bien||a.type_bien==='inconnu').length
        const total      = zone.adresses.length

        return (
          <div key={zone.id} className="zone-page">
            {/* En-tete */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:8, borderBottom:'2px solid '+zone.couleur, paddingBottom:8 }}>
              <div style={{ width:16, height:16, borderRadius:'50%', background:zone.couleur, marginTop:3, flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>{zone.nom}</h1>
                <p style={{ fontSize:12, color:'#6b7280', margin:'3px 0 0' }}>
                  {total} adresses prospectables
                  {zone.nb_dpe_chauds > 0 && (
                    <span style={{ marginLeft:14, color:'#dc2626', fontWeight:600 }}>
                      📋 {zone.nb_dpe_chauds} DPE &lt; 6 mois
                    </span>
                  )}
                </p>
              </div>
              <div style={{ fontSize:11, color:'#9ca3af', textAlign:'right', flexShrink:0 }}>
                <div style={{ fontWeight:600 }}>PROspector</div>
                <div>{today}</div>
              </div>
            </div>

            {/* Carte canvas */}
            {zone.adresses.length > 0 && <ZoneMap zone={zone} mapW={mapW} mapH={mapH} />}

            {/* Legende */}
            <div style={{ display:'flex', gap:16, fontSize:11, color:'#6b7280', margin:'6px 0 10px', flexWrap:'wrap' }}>
              <span><span style={{ color:'#16a34a' }}>●</span> Maison</span>
              <span><span style={{ color:'#2563eb' }}>●</span> Appartement</span>
              <span><span style={{ color:'#ea580c' }}>●</span> Commerce</span>
              <span><span style={{ color:'#9ca3af' }}>●</span> Non qualifie</span>
            </div>

            {/* Stats */}
            <h2 style={{ fontSize:13, fontWeight:700, marginBottom:6, color:'#374151' }}>Composition de la zone</h2>
            {[
              { icon:'🏠', label:'Habitat individuel (maison)',     nb:nbMaison   },
              { icon:'🏢', label:'Habitat collectif (appartement)', nb:nbAppart   },
              { icon:'🏪', label:'Commerce / Local',                nb:nbCommerce },
              { icon:'❓', label:'Non qualifie',                    nb:nbInconnu  },
            ].map(row => (
              <div key={row.label} className="stat-row">
                <span style={{ fontSize:16 }}>{row.icon}</span>
                <span style={{ flex:1, fontSize:13 }}>{row.label}</span>
                <span style={{ fontWeight:700, fontSize:14, minWidth:28, textAlign:'right' }}>{row.nb}</span>
                <span style={{ fontSize:12, color:'#9ca3af', minWidth:38, textAlign:'right' }}>{total>0?Math.round(row.nb/total*100):0}%</span>
              </div>
            ))}

            {zone.nb_dpe_chauds > 0 && (
              <div style={{ marginTop:8, padding:'7px 12px', background:'#fef2f2', borderRadius:6, border:'1px solid #fecaca' }}>
                <span style={{ fontSize:13, color:'#dc2626', fontWeight:600 }}>
                  📋 {zone.nb_dpe_chauds} DPE realises dans les 6 derniers mois
                </span>
                <span style={{ fontSize:12, color:'#b91c1c', marginLeft:8 }}>
                  ({total>0?Math.round(zone.nb_dpe_chauds/total*100):0}% des adresses) — Signal commercial fort
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function PrintPage() {
  return (
    <Suspense fallback={<div style={{ padding:40 }}>Chargement...</div>}>
      <PrintContent />
    </Suspense>
  )
}
