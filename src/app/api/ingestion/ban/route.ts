import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  const key = request.headers.get('x-internal-key')
  if (key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { code_insee, nom, commune_id } = await request.json()

  const supabase = createAdminClientDirect<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    console.log(`[BAN] Ingestion ${nom} (${code_insee})...`)

    // Requêtes parallèles avec toutes les lettres + chiffres
    const chars = [
  'rue', 'ker', 'all', 'imp', 'che', 'rou', 'pla', 'ven', 'cit', 'vil',
  'ham', 'lie', 'bou', 'pas', 'res', 'dom', 'tre', 'lan', 'men', 'pen',
  'ros', 'bod', 'str', 'bra', 'hen', 'par', 'coa', 'koa', 'tei', 'lez',
  'loc', 'plo', 'plou', 'beg', 'gui', 'mou', 'pon', 'por', 'ran', 'san',
  '1 r', '2 r', '3 r', '4 r', '5 r', '6 r', '7 r', '8 r', '9 r', '10 ',
  '11 ', '12 ', '13 ', '14 ', '15 ', '20 ', '25 ', '30 ', '40 ', '50 ',
]
    const fetchChar = async (q: string) => {
      try {
        const res = await fetch(
         `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&citycode=${codeInsee}&limit=50`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) return []
        const data = await res.json()
        return data.features ?? []
      } catch {
        return []
      }
    }

    // Traitement par lots de 10 pour éviter de surcharger l'API
    const allFeatures: any[] = []
    const seen = new Set<string>()

    for (let i = 0; i < chars.length; i += 10) {
      const batch = chars.slice(i, i + 10)
      const results = await Promise.all(batch.map(fetchChar))
      for (const features of results) {
        for (const f of features) {
          const id = f.properties.id
          if (!id || seen.has(id)) continue
          seen.add(id)
          allFeatures.push(f)
        }
      }
    }

    console.log(`[BAN] ${allFeatures.length} adresses trouvées pour ${nom}`)

    if (allFeatures.length === 0) {
      await supabase.from('communes').update({ chargee_at: new Date().toISOString() }).eq('id', commune_id)
      return NextResponse.json({ ok: true, count: 0 })
    }

    // Insérer par lots de 500
    const BATCH_SIZE = 500
    let totalInserted = 0

    for (let i = 0; i < allFeatures.length; i += BATCH_SIZE) {
      const batch = allFeatures.slice(i, i + BATCH_SIZE).map((f: any) => ({
        id: f.properties.id,
        code_insee,
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
