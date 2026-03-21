import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  const key = request.headers.get('x-internal-key')
  if (key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { code_insee, nom, departement, commune_id } = await request.json()

  const supabase = createAdminClientDirect<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    console.log(`[BAN] Ingestion ${nom} (${code_insee}) via CSV département...`)

    // Télécharger le CSV BAN du département (source complète, sans limite)
    const dept = (departement ?? code_insee.substring(0, 2)).padStart(2, '0')
    const csvUrl = `https://adresse.data.gouv.fr/data/ban/adresses/latest/csv/adresses-${dept}.csv.gz`

    const res = await fetch(csvUrl, { signal: AbortSignal.timeout(60000) })
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`)

    // Décompresser le gzip
    const { createGunzip } = await import('zlib')
    const { Readable } = await import('stream')

    const buffer = Buffer.from(await res.arrayBuffer())
    const gunzip = createGunzip()
    const readable = Readable.from(buffer)

    const lines: string[] = []
    let header = ''

    await new Promise<void>((resolve, reject) => {
      let remaining = ''
      readable.pipe(gunzip)
        .on('data', (chunk: Buffer) => {
          const text = remaining + chunk.toString('utf8')
          const parts = text.split('\n')
          remaining = parts.pop() ?? ''
          for (const line of parts) {
            if (!header) { header = line; continue }
            if (line.includes(`;${code_insee};`) || line.includes(`,${code_insee},`)) {
              lines.push(line)
            }
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })

    console.log(`[BAN] ${lines.length} adresses trouvées pour ${nom}`)

    if (lines.length === 0) {
      await supabase.from('communes').update({ chargee_at: new Date().toISOString() }).eq('id', commune_id)
      return NextResponse.json({ ok: true, count: 0 })
    }

    // Parser le CSV (séparateur ; ou ,)
    const sep = header.includes(';') ? ';' : ','
    const cols = header.split(sep)
    const idx = (name: string) => cols.indexOf(name)

    const idCol = idx('id')
    const numCol = idx('numero')
    const voieCol = idx('nom_voie')
    const cpCol = idx('code_postal')
    const comCol = idx('nom_commune')
    const inseeCol = idx('code_insee')
    const latCol = idx('lat')
    const lonCol = idx('lon')

    const BATCH_SIZE = 500
    let totalInserted = 0

    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      const batch = lines.slice(i, i + BATCH_SIZE)
        .map(line => {
          const c = line.split(sep)
          const lat = parseFloat(c[latCol])
          const lon = parseFloat(c[lonCol])
          if (isNaN(lat) || isNaN(lon)) return null
          return {
            id: c[idCol] || `${code_insee}-${c[numCol]}-${c[voieCol]}`.replace(/\s/g, '-').toLowerCase(),
            code_insee: c[inseeCol] || code_insee,
            numero: c[numCol] || null,
            nom_voie: c[voieCol] || 'Voie inconnue',
            code_postal: c[cpCol] || null,
            commune: c[comCol] || nom,
            lat,
            lon,
            type_bien: 'inconnu' as const,
            prospectable: true,
            source: 'BAN',
          }
        })
        .filter(Boolean) as any[]

      if (batch.length === 0) continue

      const { error } = await supabase.from('adresses').upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
      if (error) console.error(`[BAN] Erreur batch ${i}:`, error.message)
      else totalInserted += batch.length
    }

    await supabase.from('communes').update({ chargee_at: new Date().toISOString() }).eq('id', commune_id)
    console.log(`[BAN] ✓ ${totalInserted} adresses insérées pour ${nom}`)
    return NextResponse.json({ ok: true, count: totalInserted })

  } catch (err: any) {
    console.error(`[BAN] Erreur:`, err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
