-- Ajoute le champ image pour le mode "Texte unique" dans les templates courrier
ALTER TABLE lettre_templates_v2
  ADD COLUMN IF NOT EXISTS unique_image JSONB DEFAULT NULL;
