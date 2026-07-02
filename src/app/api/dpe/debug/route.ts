import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/dpe/debug?secret=<CRON_SECRET>&numero=<numero_dpe>[&insee=...][&commune=...]
//
// Route de diagnostic exhaustivité : pour un numero_dpe donné, compare
// ce que renvoie l'API ADEME (dpe03existant) avec le contenu de
// dpe_logement et l'état de la commune. Lecture seule.

const CRON_SECRET = process.env.CRON_SECRET ?? '05091974'
const DPE_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const numero  = searchParams.get('numero')  ?? ''
  const insee   = searchParams.get('insee')   ?? ''
  const commune = searchParams.get('commune') ?? ''

  const adminDb = createAdminClient()
  const out: any = {}

  // ── 1. L'ADEME connaît-il ce DPE ? ─────────────────────────────────
  if (numero) {
    try {
      const params = new URLSearchParams({
        qs: `numero_dpe:"${numero}"`,
        size: '5',
        select: [
          'numero_dpe', 'date_etablissement_dpe', 'date_derniere_modification_dpe',
          'date_visite_diagnostiqueur',
          'code_insee_ban', 'code_postal_ban', 'code_postal_brut',
          'adresse_ban', 'adresse_brut', 'nom_commune_ban',
          'etiquette_dpe', 'type_batiment', 'statut_geocodage',
        ].join(','),
      })
      const r = await fetch(DPE_BASE + '?' + params)
      const d = await r.json()
      out.ademe = { status: r.status, total: d.total ?? null, results: d.results ?? [] }
    } catch (e: any) {
      out.ademe = { error: e.message }
    }

    // ── 2. Est-il dans dpe_logement ? ────────────────────────────────
    const { data: local } = await adminDb
      .from('dpe_logement')
      .select('numero_dpe, code_insee, code_postal, adresse_brute, etiquette_dpe, date_etablissement, date_modification, adresse_id, match_confiance')
      .eq('numero_dpe', numero)
    out.dpe_logement = local ?? []
  }

  // ── 3. État de la commune ────────────────────────────────────────
  let inseeToCheck = insee
  if (!inseeToCheck && commune) {
    const { data: c } = await adminDb
      .from('communes')
      .select('code_insee')
      .ilike('nom', commune)
      .limit(1)
      .maybeSingle()
    inseeToCheck = c?.code_insee ?? ''
  }

  if (inseeToCheck) {
    const { data: communeRows } = await adminDb
      .from('communes')
      .select('code_insee, nom, code_postal, derniere_verif_dpe, nb_dpe')
      .eq('code_insee', inseeToCheck)
    out.commune = communeRows ?? []

    const { data: latest } = await adminDb
      .from('dpe_logement')
      .select('numero_dpe, adresse_brute, date_etablissement, date_modification')
      .eq('code_insee', inseeToCheck)
      .order('date_etablissement', { ascending: false })
      .limit(5)
    out.derniers_dpe_commune = latest ?? []
  }

  return NextResponse.json(out)
}
