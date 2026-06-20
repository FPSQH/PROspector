-- En-tête et pied de page personnalisables pour les templates courriers
ALTER TABLE lettre_templates_v2
  ADD COLUMN IF NOT EXISTS header_enabled   BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS header_html      TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS header_height_mm INTEGER  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS footer_enabled   BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_html      TEXT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS footer_height_mm INTEGER  NOT NULL DEFAULT 20;
