import { getEffectiveCommercialId } from '@/lib/delegation'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/communes — liste des communes du commercial connecté
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ communes: [] })

  const effectiveId = await getEffectiveCommercialId()

  const { data: communes } = await supabase
    .from('communes')
    .select('id, code_insee, nom, code_postal, departement, chargee_at')
    .eq('commercial_id', effectiveId)
    .order('nom')

  // Pour chaque commune chargée, compter les adresses
  const result = await Promise.all(
    (communes ?? []).map(async (c: any) => {
      if (!c.chargee_at) return { ...c, nb_adresses: 0 }
      const { count } = await supabase
        .from('adresses')
        .select('id', { count: 'exact', head: true })
        .eq('code_insee', c.code_insee)
      return { ...c, nb_adresses: count ?? 0 }
    })
  )

  return NextResponse.json({ communes: result }, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
  })
}

// POST /api/communes — ajouter une commune et déclencher l'ingestion BAN
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const effectiveId = await getEffectiveCommercialId()

  const body = await req.json().catch(() => null)
  if (!body?.code_insee) {
    return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })
  }

  const { code_insee, nom, code_postal, departement } = body

  // Vérifier si déjà présente
  const { data: existing } = await supabase
    .from('communes')
    .select('id')
    .eq('commercial_id', effectiveId)
    .eq('code_insee', code_insee)
    .single()

  if (existing) {
    return NextResponse.json({ commune: existing, already_exists: true })
  }

  // Insérer la commune
  const { data: commune, error } = await supabase
    .from('communes')
    .insert({
      commercial_id: effectiveId,
      code_insee,
      nom:         nom ?? '',
      code_postal: code_postal ?? '',
      departement: departement ?? '',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Déclencher ingestion BAN en arrière-plan (fire & forget)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

  // Ingestion BAN (fire & forget)
  fetch(`${baseUrl}/api/ingestion/ban`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
    body: JSON.stringify({
      code_insee,
      nom,
      departement,
      commune_id: commune.id,
    }),
  }).catch((e) => console.error('[BAN] fire & forget error:', e))

  // Ingestion DPE ADEME (fire & forget) — déclenche automatiquement après l'ajout de commune
  // Utilise le mode full (1ère ingestion) puis incrémental les fois suivantes.
  // x-cron-secret requis : cet appel serveur→serveur ne transporte pas les
  // cookies de session, sans lui l'ingestion échoue en 401.
  fetch(`${baseUrl}/api/dpe/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': process.env.CRON_SECRET ?? '05091974',
    },
    body: JSON.stringify({ code_postal: code_postal ?? '', code_insee }),
  }).catch((e) => console.error('[DPE] fire & forget error:', e))

  return NextResponse.json({ commune })
}
