-- ═══════════════════════════════════════════════════════════════════════
-- Table : lettre_templates_v2  (Phase 2 — templates multiples, JSONB)
-- Plusieurs templates par commercial, sections configurables en JSONB.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lettre_templates_v2 (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  commercial_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL DEFAULT 'Nouveau template',
  is_default       boolean NOT NULL DEFAULT false,
  mode             text NOT NULL DEFAULT 'sections'
                   CHECK (mode IN ('sections','unique')),
  unique_text      text,                    -- utilisé quand mode = 'unique'
  logo_data        text,                    -- image encodée en base64
  logo_mime        text,                    -- 'image/png', 'image/jpeg', etc.
  sections_config  jsonb,                   -- TemplateSection[] — null = defaults
  envelope_enabled boolean NOT NULL DEFAULT false,
  envelope_line1   text NOT NULL DEFAULT 'Mr et ou Mme le Propriétaire',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE lettre_templates_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_owner_select" ON lettre_templates_v2
  FOR SELECT USING (commercial_id = auth.uid());

CREATE POLICY "v2_owner_insert" ON lettre_templates_v2
  FOR INSERT WITH CHECK (commercial_id = auth.uid());

CREATE POLICY "v2_owner_update" ON lettre_templates_v2
  FOR UPDATE USING (commercial_id = auth.uid())
  WITH CHECK (commercial_id = auth.uid());

CREATE POLICY "v2_owner_delete" ON lettre_templates_v2
  FOR DELETE USING (commercial_id = auth.uid());

-- Un seul template "default" par commercial (index partiel unique)
CREATE UNIQUE INDEX lettre_templates_v2_one_default
  ON lettre_templates_v2 (commercial_id)
  WHERE is_default = true;

-- Trigger updated_at (réutilise la fonction créée pour lettre_templates)
CREATE TRIGGER lettre_templates_v2_updated_at
  BEFORE UPDATE ON lettre_templates_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
