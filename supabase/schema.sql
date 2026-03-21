-- ============================================================
-- PROspector – Schéma base de données Supabase
-- Phase 0 – Fondations
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- Extension géospatiale (nécessaire pour les zones et adresses)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- TABLE : commerciaux
-- Profils utilisateurs liés à l'auth Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS commerciaux (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom         TEXT NOT NULL,
  prenom      TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'commercial'
                CHECK (role IN ('commercial', 'manager')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE : communes
-- Communes actives par commercial (son secteur)
-- ============================================================
CREATE TABLE IF NOT EXISTS communes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id  UUID NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  code_insee     TEXT NOT NULL,
  nom            TEXT NOT NULL,
  code_postal    TEXT,
  departement    TEXT,
  chargee_at     TIMESTAMPTZ,   -- NULL = chargement en attente ou en cours
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_id, code_insee)
);

-- ============================================================
-- TABLE : adresses
-- Socle BAN + enrichissements métier
-- ============================================================
CREATE TABLE IF NOT EXISTS adresses (
  -- Identifiant (id BAN si disponible, sinon généré)
  id           TEXT PRIMARY KEY,
  code_insee   TEXT NOT NULL,
  numero       TEXT,
  nom_voie     TEXT NOT NULL,
  code_postal  TEXT,
  commune      TEXT NOT NULL,
  lat          DOUBLE PRECISION NOT NULL,
  lon          DOUBLE PRECISION NOT NULL,
  -- Géométrie calculée automatiquement
  geom         GEOMETRY(Point, 4326)
                 GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
  -- Enrichissement métier
  type_bien    TEXT DEFAULT 'inconnu'
                 CHECK (type_bien IN ('maison','appartement','commerce','logement_social','inconnu')),
  nb_bal       INTEGER,          -- nb boîtes aux lettres (immeubles)
  prospectable BOOLEAN DEFAULT TRUE,
  source       TEXT DEFAULT 'BAN',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adresses_geom_idx      ON adresses USING GIST(geom);
CREATE INDEX IF NOT EXISTS adresses_insee_idx     ON adresses(code_insee);
CREATE INDEX IF NOT EXISTS adresses_type_bien_idx ON adresses(type_bien);

-- ============================================================
-- TABLE : adresses_historique
-- 3 dernières modifications par champ (RGPD / audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS adresses_historique (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adresse_id      TEXT NOT NULL REFERENCES adresses(id) ON DELETE CASCADE,
  champ           TEXT NOT NULL,
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  modifie_par     UUID REFERENCES commerciaux(id),
  modifie_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS historique_adresse_idx ON adresses_historique(adresse_id, champ, modifie_at DESC);

-- ============================================================
-- TABLE : zones_prospection
-- Périmètres géographiques avec polygones PostGIS
-- ============================================================
CREATE TABLE IF NOT EXISTS zones_prospection (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id        UUID NOT NULL REFERENCES commerciaux(id) ON DELETE CASCADE,
  nom                  TEXT NOT NULL,
  numero               INTEGER,   -- Zone 1 à 9
  couleur              TEXT DEFAULT '#3B82F6',
  polygone             GEOMETRY(Polygon, 4326),
  capacite_theorique   INTEGER,   -- Objectif 100-150 adresses
  statut               TEXT DEFAULT 'active'
                         CHECK (statut IN ('active','inactive','en_revision')),
  -- Stats agrégées (recalculées périodiquement)
  nb_adresses          INTEGER DEFAULT 0,
  nb_prospectables     INTEGER DEFAULT 0,
  nb_logements_sociaux INTEGER DEFAULT 0,
  -- Performance (mise à jour après chaque session)
  nb_portes_total      INTEGER DEFAULT 0,
  nb_contacts_total    INTEGER DEFAULT 0,
  nb_mandats_total     INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS zones_polygone_idx     ON zones_prospection USING GIST(polygone);
CREATE INDEX IF NOT EXISTS zones_commercial_idx   ON zones_prospection(commercial_id);

-- ============================================================
-- TABLE : sessions_prospection
-- Créneaux terrain (planifiés ou réalisés)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions_prospection (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id          UUID NOT NULL REFERENCES zones_prospection(id),
  commercial_id    UUID NOT NULL REFERENCES commerciaux(id),
  date_session     DATE NOT NULL,
  heure_debut      TIME DEFAULT '10:00',
  heure_fin        TIME DEFAULT '12:00',
  -- Horaires réels (remplis après la session)
  heure_debut_reel TIMESTAMPTZ,
  heure_fin_reel   TIMESTAMPTZ,
  statut           TEXT DEFAULT 'planifiee'
                     CHECK (statut IN ('planifiee','en_cours','realisee','annulee','non_realisee')),
  origine          TEXT DEFAULT 'auto' CHECK (origine IN ('auto','manuel')),
  notes            TEXT,
  -- Pour le moteur de report automatique
  session_reportee_depuis UUID REFERENCES sessions_prospection(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_commercial_idx ON sessions_prospection(commercial_id, date_session);
CREATE INDEX IF NOT EXISTS sessions_zone_idx       ON sessions_prospection(zone_id);

-- ============================================================
-- TABLE : contacts
-- Personnes rencontrées lors des sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id        UUID NOT NULL REFERENCES commerciaux(id),
  adresse_id           TEXT REFERENCES adresses(id),
  -- Infos minimales (RGPD : pas d'infos sensibles)
  prenom               TEXT,
  type_contact         TEXT CHECK (type_contact IN (
                         'interet_vente','projet_moyen_terme','voisin_relais',
                         'commercant','recommandation','autre'
                       )),
  horizon_vente        TEXT CHECK (horizon_vente IN (
                         'immediat','3_mois','6_mois','1_an','plus'
                       )),
  notes                TEXT CHECK (char_length(notes) <= 500),  -- Limite RGPD
  -- Recommandation hors-secteur
  hors_secteur         BOOLEAN DEFAULT FALSE,
  commercial_cible_id  UUID REFERENCES commerciaux(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE : interactions
-- Ce qui se passe à chaque adresse pendant une session
-- ============================================================
CREATE TABLE IF NOT EXISTS interactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES sessions_prospection(id) ON DELETE CASCADE,
  adresse_id     TEXT NOT NULL REFERENCES adresses(id),
  contact_id     UUID REFERENCES contacts(id),
  -- Résultat de la visite
  presence       BOOLEAN NOT NULL,  -- TRUE = contact établi
  action         TEXT CHECK (action IN ('flyer_depose','courrier_depose','rien')),
  statut_adresse TEXT DEFAULT 'visite'
                   CHECK (statut_adresse IN (
                     'jamais_vue','visite','contact','rdv_pris','estimation','mandat_signe'
                   )),
  note_vocale_url TEXT,  -- URL fichier audio dans Supabase Storage
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interactions_session_idx ON interactions(session_id);
CREATE INDEX IF NOT EXISTS interactions_adresse_idx ON interactions(adresse_id);

-- ============================================================
-- TABLE : rendez_vous
-- RDV avec export ICS pour Outlook
-- ============================================================
CREATE TABLE IF NOT EXISTS rendez_vous (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id UUID NOT NULL REFERENCES commerciaux(id),
  contact_id    UUID REFERENCES contacts(id),
  adresse_id    TEXT REFERENCES adresses(id),
  type_rdv      TEXT NOT NULL CHECK (type_rdv IN (
                  'estimation','signature_mandat','prospection','autre'
                )),
  date_rdv      TIMESTAMPTZ NOT NULL,
  duree_minutes INTEGER DEFAULT 60,
  lieu          TEXT,
  notes         TEXT CHECK (char_length(notes) <= 500),
  -- Référence ICS (pour éviter les doublons)
  ics_uid       TEXT UNIQUE DEFAULT 'rdv-' || gen_random_uuid()::text,
  ics_genere_at TIMESTAMPTZ,
  statut        TEXT DEFAULT 'confirme'
                  CHECK (statut IN ('confirme','annule','realise')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rdv_commercial_idx ON rendez_vous(commercial_id, date_rdv);

-- ============================================================
-- TRIGGERS : updated_at automatique
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_commerciaux_updated       BEFORE UPDATE ON commerciaux          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_adresses_updated          BEFORE UPDATE ON adresses             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_zones_updated             BEFORE UPDATE ON zones_prospection    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sessions_updated          BEFORE UPDATE ON sessions_prospection FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_contacts_updated          BEFORE UPDATE ON contacts             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rdv_updated               BEFORE UPDATE ON rendez_vous          FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER : limite historique à 3 entrées par adresse + champ
-- ============================================================
CREATE OR REPLACE FUNCTION limit_adresse_historique()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM adresses_historique
  WHERE adresse_id = NEW.adresse_id
    AND champ = NEW.champ
    AND id NOT IN (
      SELECT id FROM adresses_historique
      WHERE adresse_id = NEW.adresse_id AND champ = NEW.champ
      ORDER BY modifie_at DESC
      LIMIT 2  -- garde 2, le NEW fait le 3e
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_limit_historique
AFTER INSERT ON adresses_historique
FOR EACH ROW EXECUTE FUNCTION limit_adresse_historique();

-- ============================================================
-- TRIGGER : marquer prospectable=FALSE si logement_social
-- ============================================================
CREATE OR REPLACE FUNCTION sync_prospectable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type_bien = 'logement_social' THEN
    NEW.prospectable = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_prospectable
BEFORE INSERT OR UPDATE OF type_bien ON adresses
FOR EACH ROW EXECUTE FUNCTION sync_prospectable();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE commerciaux         ENABLE ROW LEVEL SECURITY;
ALTER TABLE communes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones_prospection   ENABLE ROW LEVEL SECURITY;
ALTER TABLE adresses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE adresses_historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions_prospection ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendez_vous         ENABLE ROW LEVEL SECURITY;

-- Fonction helper : est-ce un manager ?
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM commerciaux
    WHERE id = auth.uid() AND role = 'manager'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- commerciaux : chacun voit son profil, manager voit tout
CREATE POLICY "commerciaux_policy" ON commerciaux
  FOR ALL USING (id = auth.uid() OR is_manager());

-- communes : propres communes ou manager
CREATE POLICY "communes_policy" ON communes
  FOR ALL USING (commercial_id = auth.uid() OR is_manager());

-- zones : propres zones ou manager
CREATE POLICY "zones_policy" ON zones_prospection
  FOR ALL USING (commercial_id = auth.uid() OR is_manager());

-- adresses : accessibles si commune active pour ce commercial
CREATE POLICY "adresses_select" ON adresses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM communes
      WHERE code_insee = adresses.code_insee
        AND commercial_id = auth.uid()
        AND chargee_at IS NOT NULL
    ) OR is_manager()
  );

CREATE POLICY "adresses_update" ON adresses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM communes
      WHERE code_insee = adresses.code_insee
        AND commercial_id = auth.uid()
    ) OR is_manager()
  );

-- historique : lecture pour tous les commerciaux authentifiés
CREATE POLICY "historique_select" ON adresses_historique
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "historique_insert" ON adresses_historique
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- sessions : propres sessions ou manager
CREATE POLICY "sessions_policy" ON sessions_prospection
  FOR ALL USING (commercial_id = auth.uid() OR is_manager());

-- interactions : via session du commercial
CREATE POLICY "interactions_policy" ON interactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions_prospection s
      WHERE s.id = interactions.session_id
        AND s.commercial_id = auth.uid()
    ) OR is_manager()
  );

-- contacts : propres contacts ou manager
CREATE POLICY "contacts_policy" ON contacts
  FOR ALL USING (commercial_id = auth.uid() OR is_manager());

-- rendez-vous : propres rdv ou manager
CREATE POLICY "rdv_policy" ON rendez_vous
  FOR ALL USING (commercial_id = auth.uid() OR is_manager());

-- ============================================================
-- FONCTION : créer profil commercial après inscription
-- (déclenché via Supabase Auth webhook ou trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO commerciaux (id, email, nom, prenom)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nom', ''),
    COALESCE(NEW.raw_user_meta_data->>'prenom', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- VUE : statistiques par zone (utilisée pour les dashboards)
-- ============================================================
CREATE OR REPLACE VIEW stats_zones AS
SELECT
  z.id,
  z.commercial_id,
  z.nom,
  z.numero,
  z.capacite_theorique,
  z.nb_adresses,
  z.nb_prospectables,
  -- Sessions
  COUNT(DISTINCT s.id) FILTER (WHERE s.statut = 'realisee')    AS nb_sessions_realisees,
  COUNT(DISTINCT s.id) FILTER (WHERE s.statut = 'planifiee')   AS nb_sessions_planifiees,
  MAX(s.date_session)  FILTER (WHERE s.statut = 'realisee')    AS dernier_passage,
  -- Activité
  COUNT(i.id)                                                   AS nb_interactions,
  COUNT(i.id) FILTER (WHERE i.presence = TRUE)                 AS nb_contacts,
  COUNT(i.id) FILTER (WHERE i.action = 'flyer_depose')         AS nb_flyers,
  -- Taux de couverture
  CASE WHEN z.nb_prospectables > 0
    THEN ROUND(COUNT(DISTINCT i.adresse_id)::NUMERIC / z.nb_prospectables * 100, 1)
    ELSE 0
  END AS taux_couverture_pct
FROM zones_prospection z
LEFT JOIN sessions_prospection s ON s.zone_id = z.id
LEFT JOIN interactions i ON i.session_id = s.id
GROUP BY z.id, z.commercial_id, z.nom, z.numero, z.capacite_theorique, z.nb_adresses, z.nb_prospectables;
