import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VERIF_INTERVAL_DAYS = 7

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  // Commercial connecté (direct ou manager)
  let { data: commercial } = await adminDb
    .from('commerciaux').select('id, derniere_connexion').eq('id', user.id).maybeSingle()
  if (!commercial) {
    const { data: asManager } = await adminDb
      .from('commerciaux').select('id, derniere_connexion').eq('manager_id', user.id).limit(1).maybeSingle()
    commercial = asManager ?? null
  }
  if (!commercial) return NextResponse.json({ nb_nouveaux: 0, communes_verifiees: 0 })

  const commercialId = commercial.id
  const derniereConnexion = commercial.derniere_connexion
    ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  // Communes du secteur
  const { data: communes } = await adminDb
    .from('communes').select('code_insee, nom, code_postal, derniere_verif_dpe')
    .eq('commercial_id', commercialId)
  if (!communes?.length) return NextResponse.json({ nb_nouveaux: 0, communes_verifiees: 0 })

  // Nouveaux DPE depuis la dernière connexion
  const codeInsees = communes.map((c: any) => c.code_insee)
  const { count: nbNouveaux } = await adminDb
    .from('dpe_logement').select('id', { count: 'exact', head: true })
    .in('code_insee', codeInsees)
    .gte('date_etablissement', derniereConnexion.slice(0, 10))

  // Communes à vérifier (jamais vérifiées ou > 7 jours)
  const now = Date.now()
  const maxAge = VERIF_INTERVAL_DAYS * 24 * 3600 * 1000
  const toCheck = communes.filter((c: any) =>
    !c.derniere_verif_dpe || (now - new Date(c.derniere_verif_dpe).getTime()) > maxAge
  )

  // Fire & forget ingestion pour chaque commune à vérifier
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  for (const commune of toCheck) {
    fetch(`${baseUrl}/api/dpe/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code_postal: commune.code_postal ?? '',
        code_insee:  commune.code_insee,
        force_full:  !commune.derniere_verif_dpe,
      }),
    }).catch((e: Error) => console.error('[DPE check]', commune.nom, e.message))
  }

  // Mettre à jour derniere_connexion
  await adminDb.from('commerciaux')
    .update({ derniere_connexion: new Date().toISOString() })
    .eq('id', commercialId)

  return NextResponse.json({
    nb_nouveaux:        nbNouveaux ?? 0,
    communes_verifiees: toCheck.length,
    communes_total:     communes.length,
  })
}
