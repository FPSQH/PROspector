// ============================================================
// Types TypeScript – PROspector
// Reflet du schéma Supabase (schema.sql)
// ============================================================

export type Role = 'commercial' | 'manager'
export type TypeBien = 'maison' | 'appartement' | 'commerce' | 'logement_social' | 'inconnu'
export type StatutSession = 'planifiee' | 'en_cours' | 'realisee' | 'annulee' | 'non_realisee'
export type StatutAdresse = 'jamais_vue' | 'visite' | 'contact' | 'rdv_pris' | 'estimation' | 'mandat_signe'
export type TypeContact = 'interet_vente' | 'projet_moyen_terme' | 'voisin_relais' | 'commercant' | 'recommandation' | 'autre'
export type HorizonVente = 'immediat' | '3_mois' | '6_mois' | '1_an' | 'plus'
export type TypeRdv = 'estimation' | 'signature_mandat' | 'prospection' | 'autre'
export type ActionVisite = 'flyer_depose' | 'courrier_depose' | 'rien'
export type StatutZone = 'active' | 'inactive' | 'en_revision'

export interface Commercial {
  id: string
  nom: string
  prenom: string
  email: string
  role: Role
  created_at: string
  updated_at: string
}

export interface Commune {
  id: string
  commercial_id: string
  code_insee: string
  nom: string
  code_postal: string | null
  departement: string | null
  chargee_at: string | null
  created_at: string
}

export interface Adresse {
  id: string
  code_insee: string
  numero: string | null
  nom_voie: string
  code_postal: string | null
  commune: string
  lat: number
  lon: number
  type_bien: TypeBien
  nb_bal: number | null
  prospectable: boolean
  source: string
  created_at: string
  updated_at: string
  // Calculé côté client après fetch des interactions
  statut_prospection?: StatutAdresse
}

export interface BdnbBatimentGroupe {
  batiment_groupe_id: string
  code_commune_insee: string | null
  code_departement_insee: string | null
  libelle_commune_insee: string | null
  libelle_adr_principale_ban: string | null
  cle_interop_adr_principale_ban: string | null
  l_cle_interop_adr: string[] | null
  l_parcelle_id: string[] | null
  nb_adresse_valid_ban: number | null
  // Géométrie
  geom_groupe: Record<string, unknown> | null
  s_geom_groupe: number | null
  lat_centre: number | null
  lon_centre: number | null
  // Physique
  usage_principal_bdnb_open: string | null
  usage_niveau_1_txt: string | null
  type_batiment_dpe: string | null
  annee_construction: number | null
  nb_log: number | null
  nb_log_rnc: number | null
  surface_emprise_sol: number | null
  hauteur_mean: number | null
  nb_niveau: number | null
  traversant: boolean | null
  presence_balcon: boolean | null
  // DPE / Énergie
  classe_bilan_dpe: string | null
  classe_conso_energie_arrete_2012: string | null
  identifiant_dpe: string | null
  date_reception_dpe: string | null
  conso_5_usages_ep_m2: number | null
  emission_ges_5_usages_m2: number | null
  nb_classe_bilan_dpe_a: number | null
  nb_classe_bilan_dpe_b: number | null
  nb_classe_bilan_dpe_c: number | null
  nb_classe_bilan_dpe_d: number | null
  nb_classe_bilan_dpe_e: number | null
  nb_classe_bilan_dpe_f: number | null
  nb_classe_bilan_dpe_g: number | null
  // Matériaux
  mat_mur_txt: string | null
  mat_toit_txt: string | null
  type_vitrage: string | null
  type_isolation_mur_exterieur: string | null
  type_isolation_plancher_bas: string | null
  type_isolation_plancher_haut: string | null
  // Chauffage / ECS
  type_energie_chauffage: string | null
  type_generateur_chauffage: string | null
  type_installation_chauffage: string | null
  type_ventilation: string | null
  chauffage_solaire: boolean | null
  ecs_solaire: boolean | null
  type_production_energie_renouvelable: string | null
  // Patrimoine
  denomination_monument_historique: string | null
  distance_monument_historique: number | null
  quartier_prioritaire: boolean | null
  // Foncier
  valeur_fonciere_m2_residentiel_rel_commune: number | null
  // Metadata
  source: string
  updated_at: string
}

export interface AdresseHistorique {
  id: string
  adresse_id: string
  champ: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  modifie_par: string | null
  modifie_at: string
}

export interface ZoneProspection {
  id: string
  commercial_id: string
  nom: string
  numero: number | null
  couleur: string
  polygone: GeoJSONPolygon | null
  capacite_theorique: number | null
  statut: StatutZone
  nb_adresses: number
  nb_prospectables: number
  nb_logements_sociaux: number
  nb_portes_total: number
  nb_contacts_total: number
  nb_mandats_total: number
  created_at: string
  updated_at: string
}

export interface SessionProspection {
  id: string
  zone_id: string
  commercial_id: string
  date_session: string
  heure_debut: string
  heure_fin: string
  heure_debut_reel: string | null
  heure_fin_reel: string | null
  statut: StatutSession
  origine: 'auto' | 'manuel'
  notes: string | null
  session_reportee_depuis: string | null
  created_at: string
  updated_at: string
  // Relations (optionnel, selon la requête)
  zone?: ZoneProspection
  interactions?: Interaction[]
}

export interface Contact {
  id: string
  commercial_id: string
  adresse_id: string | null
  prenom: string | null
  type_contact: TypeContact | null
  horizon_vente: HorizonVente | null
  notes: string | null
  hors_secteur: boolean
  commercial_cible_id: string | null
  created_at: string
  updated_at: string
}

export interface Interaction {
  id: string
  session_id: string
  adresse_id: string
  contact_id: string | null
  presence: boolean
  action: ActionVisite | null
  statut_adresse: StatutAdresse
  note_vocale_url: string | null
  created_at: string
  // Relations
  contact?: Contact
  adresse?: Adresse
}

export interface RendezVous {
  id: string
  commercial_id: string
  contact_id: string | null
  adresse_id: string | null
  type_rdv: TypeRdv
  date_rdv: string
  duree_minutes: number
  lieu: string | null
  notes: string | null
  ics_uid: string
  ics_genere_at: string | null
  statut: 'confirme' | 'annule' | 'realise'
  created_at: string
  updated_at: string
}

// GeoJSON minimal
export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface GeoJSONPoint {
  type: 'Point'
  coordinates: [number, number]  // [lon, lat]
}

// Type Supabase Database (pour le client typé)
export interface Database {
  public: {
    Tables: {
      commerciaux: { Row: Commercial; Insert: Omit<Commercial, 'created_at' | 'updated_at'>; Update: Partial<Commercial> }
      communes: { Row: Commune; Insert: Omit<Commune, 'id' | 'created_at'>; Update: Partial<Commune> }
      adresses: { Row: Adresse; Insert: Omit<Adresse, 'created_at' | 'updated_at' | 'statut_prospection'>; Update: Partial<Adresse> }
      zones_prospection: { Row: ZoneProspection; Insert: Omit<ZoneProspection, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ZoneProspection> }
      sessions_prospection: { Row: SessionProspection; Insert: Omit<SessionProspection, 'id' | 'created_at' | 'updated_at'>; Update: Partial<SessionProspection> }
      contacts: { Row: Contact; Insert: Omit<Contact, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Contact> }
      interactions: { Row: Interaction; Insert: Omit<Interaction, 'id' | 'created_at'>; Update: Partial<Interaction> }
      rendez_vous: { Row: RendezVous; Insert: Omit<RendezVous, 'id' | 'created_at' | 'updated_at'>; Update: Partial<RendezVous> }
      bdnb_batiment_groupe: { Row: BdnbBatimentGroupe; Insert: Omit<BdnbBatimentGroupe, 'updated_at'>; Update: Partial<BdnbBatimentGroupe> }
    }
    Views: {
      stats_zones: { Row: Record<string, unknown> }
    }
    Functions: {
      is_manager: { Args: Record<string, never>; Returns: boolean }
    }
  }
}
