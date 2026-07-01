import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id_parcelle: string }> }
) {
  const { id_parcelle } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Mutations DVF de la parcelle, regroupées
  const { data: mutations } = await (supabase as any).rpc('dvf_mutations_by_parcelle', {
    p_id_parcelle: id_parcelle,
    p_annees: 10,
  })

  // Adresses rattachées à cette parcelle (via id_parcelle enrichi)
  const { data: adresses } = await supabase
    .from('adresses')
    .select('id, numero, nom_voie, code_postal, commune, batiment_groupe_id, type_bien')
    .eq('id_parcelle', id_parcelle)
    .limit(5)

  const adresseIds = (adresses ?? []).map((a: any) => a.id)
  const batimentIds = (adresses ?? []).map((a: any) => a.batiment_groupe_id).filter(Boolean)

  const [dpeRes, bdnbRes] = await Promise.all([
    adresseIds.length
      ? supabase
          .from('dpe_logement')
          .select('id, adresse_id, date_etablissement, classe_bilan_dpe, surface_habitable_logement, type_energie_principale_chauffage, numero_dpe, conso_ep_m2, cout_annuel')
          .in('adresse_id', adresseIds)
          .order('date_etablissement', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),

    batimentIds.length
      ? supabase
          .from('bdnb_batiment_groupe')
          .select(`
            batiment_groupe_id, type_batiment_dpe, annee_construction, nb_log,
            nb_niveau, surface_emprise_sol, hauteur_mean, mat_mur_txt, mat_toit_txt,
            classe_bilan_dpe, conso_5_usages_ep_m2, emission_ges_5_usages_m2,
            nb_classe_bilan_dpe_a, nb_classe_bilan_dpe_b, nb_classe_bilan_dpe_c,
            nb_classe_bilan_dpe_d, nb_classe_bilan_dpe_e, nb_classe_bilan_dpe_f, nb_classe_bilan_dpe_g
          `)
          .in('batiment_groupe_id', batimentIds)
          .limit(3)
      : Promise.resolve({ data: [] }),
  ])

  return NextResponse.json({
    id_parcelle,
    mutations: mutations ?? [],
    adresses:  adresses ?? [],
    dpe:       dpeRes.data ?? [],
    bdnb:      bdnbRes.data ?? [],
  })
}
