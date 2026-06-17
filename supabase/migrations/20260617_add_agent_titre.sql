-- Ajout du titre personnalisé du conseiller (Conseiller/Conseillère/Négociateur...)
ALTER TABLE commerciaux
  ADD COLUMN IF NOT EXISTS agent_titre TEXT NOT NULL DEFAULT 'Conseiller Immobilier';
