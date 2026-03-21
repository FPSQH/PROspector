import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { fetchAdressesByCommune } from '@/lib/ban'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

// Cette route est appelée en interne (pas par le navigateur)
// Elle utilise le service_role pour écrire en masse
export async function POST(request: Request) {
  // Vérification clé interne
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
    console.log(`[BAN] Ingestion commune ${nom} (${code_insee})...`)

    // Récupérer les adresses depuis la BAN
    const adressesBAN = await fetchAdressesByCommune(code_insee)
    console.log(`[BAN] ${adressesBAN.length} adresses trouvées`)

    if (adressesBAN.length === 0) {
      // Marquer la commune comme chargée même si vide
      await supabase.from('communes')
        .update({ chargee_at: new Date().toISOString() })
        .eq('id', commune_id)
      return NextResponse.json({ ok: true, count: 0 })
    }

    // Transformer au format Supabase par lots de 500
    const BATCH_SIZE = 500
    let totalInserted = 0

    for (let i = 0; i < adressesBAN.length; i += BATCH_SIZE) {
      const batch = adressesBAN.slice(i, i + BATCH_SIZE).map(a => ({
        id: a.id || `${code_insee}-${a.housenumber}-${a.street}`.replace(/\s/g, '-').toLowerCase(),
        code_insee,
        numero: a.housenumber ?? null,
        nom_voie: a.street ?? a.label,
        code_postal: a.postcode,
        commune: a.city,
        lat: a.y,
        lon: a.x,
        type_bien: 'inconnu' as const,
        prospectable: true,
        source: 'BAN',
      }))

      const { error } = await supabase
        .from('adresses')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true })

      if (error) console.error(`[BAN] Erreur batch ${i}:`, error.message)
      else totalInserted += batch.length
    }

    // Marquer la commune comme chargée
    await supabase.from('communes')
      .update({ chargee_at: new Date().toISOString() })
      .eq('id', commune_id)

    console.log(`[BAN] ✓ ${totalInserted} adresses insérées pour ${nom}`)
    return NextResponse.json({ ok: true, count: totalInserted })

  } catch (err: any) {
    console.error(`[BAN] Erreur ingestion ${nom}:`, err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
