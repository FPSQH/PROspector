-- Ajout des colonnes de profil agence sur la table commerciaux
-- Ces colonnes sont utilisées dans les variables {agenceNom}, {agenceAdresse},
-- {agenceTel}, {agenceEmail} des courriers DPE.
-- La migration est idempotente (ADD COLUMN IF NOT EXISTS).

ALTER TABLE commerciaux
  ADD COLUMN IF NOT EXISTS telephone        TEXT,
  ADD COLUMN IF NOT EXISTS email            TEXT,
  ADD COLUMN IF NOT EXISTS agence_nom       TEXT,
  ADD COLUMN IF NOT EXISTS agence_adresse   TEXT,
  ADD COLUMN IF NOT EXISTS agence_telephone TEXT,
  ADD COLUMN IF NOT EXISTS agence_email     TEXT;
