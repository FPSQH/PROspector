-- ═══════════════════════════════════════════════════════════
-- Table : lettre_templates
-- Une ligne par commercial — tous les champs sont optionnels.
-- NULL = utiliser le texte par défaut du générateur.
-- Les champs acceptent des variables {typeBien} {ctx} {dpe}.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lettre_templates (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  commercial_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Introduction
  intro_ab            text,   -- DPE A/B  — vars: {ctx}, {typeBien}
  intro_other         text,   -- DPE ≥ C  — vars: {ctx}, {typeBien}
  -- DPE G
  dpe_g_intro         text,   -- vars: {typeBien}
  dpe_g_detail        text,
  -- DPE F
  dpe_f_intro         text,   -- vars: {typeBien}
  dpe_f_detail        text,
  -- DPE E
  dpe_e_intro         text,
  dpe_e_detail        text,
  -- DPE C/D
  dpe_cd_intro        text,   -- vars: {dpe}
  dpe_cd_detail       text,
  -- DPE A/B
  dpe_ab_intro        text,   -- vars: {dpe}
  dpe_ab_detail       text,   -- vars: {typeBien}
  -- Estimation
  estimation          text,   -- vars: {typeBien}
  -- Vente
  vente_fg            text,   -- vars: {dpe}, {typeBien}
  vente_cd            text,   -- vars: {typeBien}, {dpe}
  vente_ab            text,   -- vars: {typeBien}, {dpe}
  -- Gestion locative
  gl_appt             text,
  gl_maison           text,
  -- Finales
  politesse1          text,
  politesse2          text,
  renovation_ca       text,
  -- Timestamps
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (commercial_id)
);

-- RLS
ALTER TABLE lettre_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select" ON lettre_templates
  FOR SELECT USING (commercial_id = auth.uid());

CREATE POLICY "owner_insert" ON lettre_templates
  FOR INSERT WITH CHECK (commercial_id = auth.uid());

CREATE POLICY "owner_update" ON lettre_templates
  FOR UPDATE USING (commercial_id = auth.uid())
  WITH CHECK (commercial_id = auth.uid());

CREATE POLICY "owner_delete" ON lettre_templates
  FOR DELETE USING (commercial_id = auth.uid());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER lettre_templates_updated_at
  BEFORE UPDATE ON lettre_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
