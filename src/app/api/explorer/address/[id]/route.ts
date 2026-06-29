import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Adresse + zone
  const { data: adresse } = await supabase
    .from('adresses')
    .select(`
      id, numero, nom_voie, code_postal, commune, code_insee,
      type_bien, prospectable, zone_id, batiment_groupe_id, lat, lon,
      zones_prospection (id, nom, couleur, numero)
    `)
    .eq('id', id)
    .single()

  if (!adresse) return NextResponse.json({ error: 'Adresse introuvable' }, { status: 404 })

  const a = adresse as any

  // Requêtes parallèles
  const [dpeRes, dvfRes, bdnbRes, interactionsRes] = await Promise.all([
    // DPE : tous les DPE de cette adresse, triés du plus récent
    supabase
      .from('dpe_logement')
      .select('id, date_etablissement, classe_bilan_dpe, classe_conso_energie_arrete_2012, surface_habitable_logement, type_energie_principale_chauffage, numero_dpe')
      .eq('adresse_id', id)
      .order('date_etablissement', { ascending: false })
      .limit(10),

    // DVF : transactions dans un rayon ~200m
    (supabase as any).rpc('dvf_for_address', { p_adresse_id: id, p_annees: 10 }),

    // BDNB
    a.batiment_groupe_id
      ? supabase
          .from('bdnb_batiment_groupe')
          .select(`
            batiment_groupe_id, type_batiment_dpe, annee_construction, nb_log,
            nb_niveau, surface_emprise_sol, hauteur_mean, mat_mur_txt, mat_toit_txt,
            classe_bilan_dpe, conso_5_usages_ep_m2, emission_ges_5_usages_m2,
            nb_classe_bilan_dpe_a, nb_classe_bilan_dpe_b, nb_classe_bilan_dpe_c,
            nb_classe_bilan_dpe_d, nb_classe_bilan_dpe_e, nb_classe_bilan_dpe_f, nb_classe_bilan_dpe_g
          `)
          .eq('batiment_groupe_id', a.batiment_groupe_id)
          .single()
      : Promise.resolve({ data: null }),

    // Interactions terrain
    supabase
      .from('interactions')
      .select(`
        id, presence, action, statut_adresse, created_at,
        sessions_prospection (date_session, type_session, zone_id,
          zones_prospection (nom, couleur))
      `)
      .eq('adresse_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({
    adresse,
    dpe:          dpeRes.data ?? [],
    dvf:          dvfRes.data ?? [],
    bdnb:         bdnbRes.data ?? null,
    interactions: interactionsRes.data ?? [],
  })
}
