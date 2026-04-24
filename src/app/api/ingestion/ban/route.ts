import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  // Auth : session cookie utilisateur OU x-internal-key (rétrocompatibilité)
  const key = request.headers.get('x-internal-key')
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user && key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
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

    // Téléchargement en parallèle : adresses numérotées + lieux-dits
    const [resAdresses, resLieuxDits] = await Promise.all([
      fetch(
        `https://plateforme.adresse.data.gouv.fr/ban/communes/${codeInsee}/download/csv-legacy/adresses`,
        { signal: AbortSignal.timeout(25000) }
      ),
      fetch(
        `https://plateforme.adresse.data.gouv.fr/ban/communes/${codeInsee}/download/csv-legacy/lieux-dits`,
        { signal: AbortSignal.timeout(25000) }
      ),
    ])

    if (!resAdresses.ok) throw new Error(`Adresses fetch failed: ${resAdresses.status}`)

    const csvAdresses = await resAdresses.text()
    const csvLieuxDits = resLieuxDits.ok ? await resLieuxDits.text() : ''

    // Parser les adresses numérotées
    const parseAdresses = (csv: string) => {
      const lines = csv.split('\n').filter(l => l.trim())
      if (lines.length < 2) return []
      const header = lines[0].split(';')
      const idx = (n: string) => header.indexOf(n)
      const idCol     = idx('id')
      const numCol    = idx('numero')
      const voieCol   = idx('nom_voie')
      const cpCol     = idx('code_postal')
      const comCol    = idx('nom_commune')
      const inseeCol  = idx('code_insee')
      const lonCol    = idx('lon')
      const latCol    = idx('lat')

      return lines.slice(1).map(line => {
        const c = line.split(';')
        const lat = parseFloat(c[latCol])
        const lon = parseFloat(c[lonCol])
        if (isNaN(lat) || isNaN(lon)) return null
        const id = c[idCol]?.trim()
        if (!id) return null
        return {
          id,
          code_insee: c[inseeCol]?.trim() || codeInsee,
          numero: c[numCol]?.trim() || null,
          nom_voie: c[voieCol]?.trim() || 'Voie inconnue',
          code_postal: c[cpCol]?.trim() || null,
          commune: c[comCol]?.trim() || nom,
          lat,
          lon,
          type_bien: 'inconnu' as const,
          prospectable: true,
          source: 'BAN',
        }
      }).filter(Boolean)
    }

    // Parser les lieux-dits (schéma différent : nom_lieu_dit, pas de numero)
    const parseLieuxDits = (csv: string) => {
      const lines = csv.split('\n').filter(l => l.trim())
      if (lines.length < 2) return []
      const header = lines[0].split(';')
      const idx = (n: string) => header.indexOf(n)
      const idCol    = idx('id')
      const nomCol   = idx('nom_lieu_dit')
      const cpCol    = idx('code_postal')
      const comCol   = idx('nom_commune')
      const inseeCol = idx('code_insee')
      const lonCol   = idx('lon')
      const latCol   = idx('lat')

      return lines.slice(1).map(line => {
        const c = line.split(';')
        const lat = parseFloat(c[latCol])
        const lon = parseFloat(c[lonCol])
        if (isNaN(lat) || isNaN(lon)) return null
        const id = c[idCol]?.trim()
        if (!id) return null
        return {
          id,
          code_insee: c[inseeCol]?.trim() || codeInsee,
          numero: null,
          nom_voie: c[nomCol]?.trim() || 'Lieu-dit inconnu',
          code_postal: c[cpCol]?.trim() || null,
          commune: c[comCol]?.trim() || nom,
          lat,
          lon,
          type_bien: 'inconnu' as const,
          prospectable: false,
          source: 'BAN',
        }
      }).filter(Boolean)
    }

    const allAdresses = [
      ...parseAdresses(csvAdresses),
      ...parseLieuxDits(csvLieuxDits),
    ] as any[]

    console.log(`[BAN] ${allAdresses.length} adresses+lieux-dits trouvés pour ${nom}`)

    if (allAdresses.length === 0) {
      await supabase.from('communes').update({ chargee_at: new Date().toISOString() }).eq('id', commune_id)
      return NextResponse.json({ ok: true, count: 0 })
    }

    // Insérer par lots de 500
    const BATCH_SIZE = 500
    let totalInserted = 0

    for (let i = 0; i < allAdresses.length; i += BATCH_SIZE) {
      const batch = allAdresses.slice(i, i + BATCH_SIZE)
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
