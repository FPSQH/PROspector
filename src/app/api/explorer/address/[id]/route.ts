import { createClient, createAdminClient } from '@/lib/supabase/server'
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
      type_bien, prospectable, zone_id, batiment_groupe_id, lat, lon, id_parcelle,
      zones_prospection (id, nom, couleur, numero)
    `)
    .eq('id', id)
    .single()

  if (!adresse) return NextResponse.json({ error: 'Adresse introuvable' }, { status: 404 })

  const a = adresse as any
  const adminDb = createAdminClient()

  // Requêtes parallèles
  const [dpeRes, dvfRes, bdnbRes, interactionsRes, contactsRes, rdvRes, marcheRes] = await Promise.all([
    // DPE : tous les DPE de cette adresse, triés du plus récent
    supabase
      .from('dpe_logement')
      .select(`
        id, numero_dpe, date_etablissement, date_fin_validite,
        etiquette_dpe, etiquette_ges, surface_habitable, energie_principale,
        conso_ep_m2, cout_annuel, annee_construction, type_batiment,
        has_audit, audit_n, audit_date, audit_scenarios
      `)
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

    // Contacts rattachés à l'adresse (RLS : ceux du commercial)
    supabase
      .from('contacts')
      .select('id, nom, prenom, tel1, email1, type_contact, horizon_vente, statut_pipeline, date_relance, notes, created_at')
      .eq('adresse_id', id)
      .order('created_at', { ascending: false })
      .limit(10),

    // Rendez-vous liés à l'adresse
    supabase
      .from('rendez_vous')
      .select('id, type_rdv, date_rdv, statut, lieu, notes')
      .eq('adresse_id', id)
      .order('date_rdv', { ascending: false })
      .limit(5),

    // Contexte marché : stats DVF de la commune (prix médians)
    (adminDb as any).rpc('dvf_stats_communes', { p_codes_insee: [a.code_insee] }),
  ])

  const marcheRow = (marcheRes?.data ?? [])[0] ?? null
  const marche = marcheRow ? {
    nb_transactions:      Number(marcheRow.nb_transactions ?? 0),
    prix_median_m2:       marcheRow.prix_median_m2      ? Number(marcheRow.prix_median_m2)      : null,
    prix_median_maison:   marcheRow.prix_median_maison  ? Number(marcheRow.prix_median_maison)  : null,
    prix_median_appart:   marcheRow.prix_median_appart  ? Number(marcheRow.prix_median_appart)  : null,
    surface_mediane_bati: marcheRow.surface_mediane_bati ? Number(marcheRow.surface_mediane_bati) : null,
  } : null

  return NextResponse.json({
    adresse,
    dpe:          dpeRes.data ?? [],
    dvf:          dvfRes.data ?? [],
    bdnb:         bdnbRes.data ?? null,
    interactions: interactionsRes.data ?? [],
    contacts:     contactsRes.data ?? [],
    rendez_vous:  rdvRes.data ?? [],
    marche,
  })
}
