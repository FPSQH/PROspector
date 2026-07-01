-- ============================================================
-- Correctif : id_parcelle assigné à tort par fallback géo
--
-- Problème : le rayon de 30m était trop large → adresses
-- voisines (ex: n°1 et n°3) héritaient du id_parcelle du n°2
-- car elles tombaient dans le rayon de sa mutation DVF.
--
-- Corrections :
--   1. Réinitialiser les id_parcelle assignés uniquement via
--      fallback géo (= ceux sans correspondance texte exacte)
--   2. Ré-appliquer le fallback géo avec un rayon strict de 8m
--      + exclusion des parcelles déjà liées à une autre adresse
--      par correspondance texte
-- ============================================================

-- Identifier les adresses liées via texte (ground truth)
-- Celles-ci doivent être préservées : commune + numéro + nom_voie match
CREATE TEMP TABLE text_matched AS
SELECT DISTINCT a.id
FROM adresses a
JOIN dvf_mutations d
  ON d.code_commune     = a.code_insee
 AND d.adresse_numero   = a.numero
 AND lower(unaccent(d.adresse_nom_voie)) = lower(unaccent(a.nom_voie))
 AND d.id_parcelle IS NOT NULL
 AND d.nature_mutation  = 'Vente';

-- Réinitialiser seulement les adresses liées via géo (= pas via texte)
UPDATE adresses
SET id_parcelle = NULL
WHERE id_parcelle IS NOT NULL
  AND id NOT IN (SELECT id FROM text_matched);

-- Ré-appliquer le fallback géo avec :
--   · Rayon réduit à 8m (≈ 0.000072 degrés)
--   · Exclure les parcelles déjà assignées à une autre adresse via texte
UPDATE adresses a
SET id_parcelle = sub.id_parcelle
FROM (
  SELECT DISTINCT ON (a2.id)
    a2.id,
    d.id_parcelle
  FROM adresses a2
  JOIN dvf_mutations d
    ON d.code_commune = a2.code_insee
   AND d.id_parcelle IS NOT NULL
   AND d.nature_mutation = 'Vente'
   -- Parcelle non déjà liée à une autre adresse par texte
   AND d.id_parcelle NOT IN (
     SELECT ad.id_parcelle FROM adresses ad
     WHERE ad.id IN (SELECT id FROM text_matched)
       AND ad.id_parcelle IS NOT NULL
   )
   AND ST_DWithin(a2.geom, d.geom, 0.000072)  -- ~8m au lieu de 30m
  WHERE a2.id_parcelle IS NULL
    AND a2.geom IS NOT NULL
    AND d.geom  IS NOT NULL
    AND a2.id NOT IN (SELECT id FROM text_matched)
  ORDER BY a2.id, ST_Distance(a2.geom, d.geom) ASC
) sub
WHERE a.id = sub.id;

DROP TABLE text_matched;
