-- ============================================================
-- Migration : Correction RPC get_stats_equipe
-- Date      : 2026-06-15
-- Corrections :
--   1. nb_mandats  : inclut désormais les contacts CRM (statut_pipeline='mandat')
--                    en plus des interactions terrain (statut_adresse='mandat_signe')
--   2. nb_contacts_chauds : corrige les valeurs horizon_vente
--                           ('immediat','3_mois' → 'moins_6_mois','6_12_mois')
-- ============================================================

CREATE OR REPLACE FUNCTION get_stats_equipe(
  p_manager_id UUID,
  p_debut      DATE DEFAULT NULL,
  p_fin        DATE DEFAULT NULL
)
RETURNS TABLE (
  commercial_id          UUID,
  nom                    TEXT,
  prenom                 TEXT,
  email                  TEXT,
  derniere_connexion     TIMESTAMPTZ,
  nb_sessions_realisees  BIGINT,
  nb_sessions_planifiees BIGINT,
  nb_sessions_total      BIGINT,
  nb_portes              BIGINT,
  nb_contacts_terrain    BIGINT,
  nb_mandats             BIGINT,
  nb_contacts_chauds     BIGINT,
  dernier_passage        DATE,
  taux_couverture_moyen  NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    c.id                              AS commercial_id,
    c.nom,
    c.prenom,
    c.email,
    c.derniere_connexion,

    -- Sessions réalisées sur la période
    COUNT(DISTINCT s.id) FILTER (
      WHERE s.statut = 'realisee'
        AND (p_debut IS NULL OR s.date_session >= p_debut)
        AND (p_fin   IS NULL OR s.date_session <= p_fin)
    )                                 AS nb_sessions_realisees,

    -- Sessions planifiées (sans filtre période, toutes celles à venir)
    COUNT(DISTINCT s.id) FILTER (
      WHERE s.statut = 'planifiee'
    )                                 AS nb_sessions_planifiees,

    COUNT(DISTINCT s.id) FILTER (
      WHERE s.statut IN ('realisee','planifiee','en_cours')
        AND (p_debut IS NULL OR s.date_session >= p_debut)
        AND (p_fin   IS NULL OR s.date_session <= p_fin)
    )                                 AS nb_sessions_total,

    -- Portes frappées (interactions sur sessions réalisées dans la période)
    COUNT(i.id) FILTER (
      WHERE s.statut = 'realisee'
        AND (p_debut IS NULL OR s.date_session >= p_debut)
        AND (p_fin   IS NULL OR s.date_session <= p_fin)
    )                                 AS nb_portes,

    -- Contacts terrain (présence = TRUE)
    COUNT(i.id) FILTER (
      WHERE i.presence = TRUE
        AND s.statut = 'realisee'
        AND (p_debut IS NULL OR s.date_session >= p_debut)
        AND (p_fin   IS NULL OR s.date_session <= p_fin)
    )                                 AS nb_contacts_terrain,

    -- Mandats signés : terrain (statut_adresse) + CRM (statut_pipeline)
    (
      -- Mandats terrain (interaction marquée mandat_signe lors d'une session)
      (SELECT COUNT(*)
       FROM interactions i2
       JOIN sessions_prospection s2 ON s2.id = i2.session_id
       WHERE s2.commercial_id = c.id
         AND i2.statut_adresse = 'mandat_signe'
         AND (p_debut IS NULL OR s2.date_session >= p_debut)
         AND (p_fin   IS NULL OR s2.date_session <= p_fin))
      +
      -- Mandats CRM (contact pipeline = mandat, filtré par date de création)
      (SELECT COUNT(*)
       FROM contacts ct
       WHERE ct.commercial_id = c.id
         AND ct.statut_pipeline = 'mandat'
         AND (p_debut IS NULL OR ct.created_at::DATE >= p_debut)
         AND (p_fin   IS NULL OR ct.created_at::DATE <= p_fin))
    )                                 AS nb_mandats,

    -- Contacts chauds : horizon vente < 6 mois ou statut estimation/mandat
    -- (valeurs réelles en DB : 'moins_6_mois', '6_12_mois', '1_2_ans', 'plus_2_ans')
    (
      SELECT COUNT(*)
      FROM contacts ct
      WHERE ct.commercial_id = c.id
        AND (
          ct.horizon_vente   = 'moins_6_mois'
          OR ct.statut_pipeline IN ('estimation', 'mandat')
        )
    )                                 AS nb_contacts_chauds,

    -- Dernier passage terrain
    MAX(s.date_session) FILTER (
      WHERE s.statut = 'realisee'
    )                                 AS dernier_passage,

    -- Taux de couverture moyen sur les zones actives
    -- (nb_portes_total = portes effectivement frappées / nb_prospectables)
    COALESCE((
      SELECT ROUND(AVG(
        CASE WHEN z.nb_prospectables > 0
          THEN z.nb_portes_total::NUMERIC / z.nb_prospectables * 100
          ELSE 0
        END
      ), 1)
      FROM zones_prospection z
      WHERE z.commercial_id = c.id
        AND z.statut = 'active'
    ), 0)                             AS taux_couverture_moyen

  FROM commerciaux c
  JOIN commerciaux mgr ON mgr.id = p_manager_id AND mgr.role = 'manager'
  LEFT JOIN sessions_prospection s  ON s.commercial_id = c.id
  LEFT JOIN interactions          i ON i.session_id = s.id

  WHERE c.manager_id = p_manager_id

  GROUP BY c.id, c.nom, c.prenom, c.email, c.derniere_connexion
  ORDER BY c.nom, c.prenom;
$$;
