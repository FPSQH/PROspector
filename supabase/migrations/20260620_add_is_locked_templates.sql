-- Ajoute is_locked sur lettre_templates_v2
-- Les templates verrouillés (templates par défaut) ne peuvent pas être supprimés.
ALTER TABLE lettre_templates_v2
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
