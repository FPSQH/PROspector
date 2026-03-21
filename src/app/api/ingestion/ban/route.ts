import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  const key = request.headers.get('x-internal-key')
  if (key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { code_insee: codeInsee, nom, commune_id } = await request.json()

  const supabase = createAdminClientDirect<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    console.log(`[BAN] Ingestion ${nom} (${codeInsee}) via fichier commune...`)

    // Téléchargement direct du fichier CSV de la commune — toutes les adresses, pas de limite
    const url = `https://plateforme.adresse.data.gouv.fr/ban/communes/${codeInsee}/download/csv-legacy/adresses`
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) })

    if (!res.ok) throw new Error(`Fichier commune fetch failed: ${res.status}`)

    const csvText = await res.text()
    const lines = csvText.split('\n').filter(l => l.trim())

    if (lines.length < 2) {
      await supabase.from('communes').update({ chargee_at: new Date().toISOString() }).eq('id', commune_id)
      return NextResponse.json({ ok: true, count: 0 })
    }

    // Parser le CSV (séparateur ;)
    const header = lines[0].split(';')
    const idx = (name: string) => header.indexOf(name)

    const idCol      = idx('id')
    const numCol     = idx('numero')
    const voieCol    = idx('nom_voie')
    const cpCol      = idx('code_postal')
    const comCol     = idx('nom_commune')
    const inseeCol   = idx('code_insee')
    const lonCol     = idx('lon')
    const latCol     = idx('lat')

    console.log(`[BAN] ${lines.length - 1} lignes trouvées pour ${nom}`)

    // Insérer par lots de 500
    const BATCH_SIZE = 500
    let totalInserted = 0

    for (let i = 1; i < lines.length; i += BATCH_SIZE) {
      const batch = lines.slice(i, i + BATCH_SIZE)
        .map(line => {
          const c = line.split(';')
          const lat = parseFloat(c[latCol])
          const lon = parseFloat(c[lonCol])
          if (isNaN(lat) || isNaN(lon)) return null
          return {
            id: c[idCol] || `${codeInsee}-${i}`,
            code_insee: c[inseeCol] || codeInsee,
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

      const { error } = await supabase
        .from('adresses')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true })

      if (error) console.error(`[BAN] Erreur batch:`, error.message)
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
