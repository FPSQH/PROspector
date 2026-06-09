import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VERIF_INTERVAL_DAYS = 2

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  let { data: commercial } = await adminDb
    .from('commerciaux').select('id, derniere_connexion').eq('id', user.id).maybeSingle()
  if (!commercial) {
    const { data: asManager } = await adminDb
      .from('commerciaux').select('id, derniere_connexion').eq('manager_id', user.id).limit(1).maybeSingle()
    commercial = asManager ?? null
  }
  if (!commercial) return NextResponse.json({ nb_nouveaux: 0, communes_a_verifier: [] })

  const commercialId = commercial.id
  const derniereConnexion = commercial.derniere_connexion
    ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const { data: communes } = await adminDb
    .from('communes').select('code_insee, nom, code_postal, derniere_verif_dpe')
    .eq('commercial_id', commercialId)
  if (!communes?.length) return NextResponse.json({ nb_nouveaux: 0, communes_a_verifier: [] })

  const codeInsees = communes.map((c: any) => c.code_insee)
  const { count: nbNouveaux } = await adminDb
    .from('dpe_logement').select('id', { count: 'exact', head: true })
    .in('code_insee', codeInsees)
    .gte('date_etablissement', derniereConnexion.slice(0, 10))

  const now = Date.now()
  const maxAge = VERIF_INTERVAL_DAYS * 24 * 3600 * 1000
  const toCheck = communes.filter((c: any) =>
    !c.derniere_verif_dpe || (now - new Date(c.derniere_verif_dpe).getTime()) > maxAge
  )

  // Mettre à jour derniere_connexion
  await adminDb.from('commerciaux')
    .update({ derniere_connexion: new Date().toISOString() })
    .eq('id', commercialId)

  // Retourner la liste des communes à vérifier (le client lancera les ingestions)
  return NextResponse.json({
    nb_nouveaux:        nbNouveaux ?? 0,
    communes_a_verifier: toCheck.map((c: any) => ({
      code_insee:  c.code_insee,
      nom:         c.nom,
      code_postal: c.code_postal ?? '',
      force_full:  !c.derniere_verif_dpe,
    })),
    communes_total: communes.length,
  })
}
