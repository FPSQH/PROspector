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
    console.log(`[BAN] Ingestion ${nom} (${codeInsee})...`)

    const queries = ['ker', 'rue', 'all', 'che', 'imp', 'rou', 'pla', 'ham', 'res', 'bou']

    const fetchQuery = async (q: string) => {
      try {
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&citycode=${codeInsee}&limit=50`
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (!res.ok) return []
        const data = await res.json()
        console.log(`[BAN] "${q}": ${data.features?.length ?? 0} résultats`)
        return data.features ?? []
      } catch (e: any) {
        console.log(`[BAN] Exception "${q}": ${e.message}`)
        return []
      }
    }

    const results = await Promise.all(queries.map(fetchQuery))
    const allFeatures: any[] = []
    const seen = new Set<string>()

    for (const features of results) {
      for (const f of features) {
        const id = f.properties.id
        if (!id || seen.has(id)) continue
        seen.add(id)
        allFeatures.push(f)
      }
    }

    console.log(`[BAN] ${allFeatures.length} adresses trouvées pour ${nom}`)

    if (allFeatures.length === 0) {
      await supabase.from('communes').update({ chargee_at: new Date().toISOString() }).eq('id', commune_id)
      return NextResponse.json({ ok: true, count: 0 })
    }

    const BATCH_SIZE = 500
    let totalInserted = 0

    for (let i = 0; i < allFeatures.length; i += BATCH_SIZE) {
      const batch = allFeatures.slice(i, i + BATCH_SIZE).map((f: any) => ({
        id: f.properties.id,
        code_insee: codeInsee,
        numero: f.properties.housenumber ?? null,
        nom_voie: f.properties.street ?? f.properties.label,
        code_postal: f.properties.postcode,
        commune: f.properties.city,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        type_bien: 'inconnu' as const,
        prospectable: true,
        source: 'BAN',
      }))

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
