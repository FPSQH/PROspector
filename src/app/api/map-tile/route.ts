import { NextResponse } from 'next/server'

// Proxy serveur pour les tuiles IGN (evite les blocages CORS/Referer)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const bbox   = searchParams.get('bbox')
  const width  = searchParams.get('width')  ?? '680'
  const height = searchParams.get('height') ?? '400'

  if (!bbox) return NextResponse.json({ error: 'bbox required' }, { status: 400 })

  const ignUrl = 'https://data.geopf.fr/wms-r?' +
    'SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap' +
    '&LAYERS=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2' +
    '&STYLES=&SRS=EPSG:4326&BBOX=' + bbox +
    '&WIDTH=' + width + '&HEIGHT=' + height + '&FORMAT=image/png'

  try {
    const res = await fetch(ignUrl, {
      headers: {
        'Referer': 'https://www.geoportail.gouv.fr/',
        'User-Agent': 'Mozilla/5.0',
      }
    })
    if (!res.ok) {
      // Fallback OSM si IGN echoue
      const [lonMin, latMin, lonMax, latMax] = bbox.split(',').map(Number)
      const osmUrl = buildOsmUrl(lonMin, latMin, lonMax, latMax, parseInt(width), parseInt(height))
      const osmRes = await fetch(osmUrl)
      if (!osmRes.ok) return new NextResponse('map unavailable', { status: 503 })
      const osmBuf = await osmRes.arrayBuffer()
      return new NextResponse(osmBuf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } })
    }
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }
    })
  } catch {
    return new NextResponse('map error', { status: 503 })
  }
}

function buildOsmUrl(lonMin: number, latMin: number, lonMax: number, latMax: number, w: number, h: number): string {
  // WMS OSM via OSMFR (supporte les bbox)
  return 'https://wms.openstreetmap.fr/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap' +
    '&LAYERS=osm&STYLES=&SRS=EPSG:4326' +
    '&BBOX=' + [lonMin,latMin,lonMax,latMax].join(',') +
    '&WIDTH=' + w + '&HEIGHT=' + h + '&FORMAT=image/png'
}
