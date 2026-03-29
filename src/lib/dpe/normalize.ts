// ─── Normalisation des données DPE ADEME ──────────────────────────────────
// Fonctions utilitaires pour le pipeline d'ingestion DPE.
// Gère les incohérences connues de l'API ADEME :
//   - codes postaux sans zéro initial
//   - dates en format ISO ou DD/MM/YYYY
//   - noms de voies avec abréviations variables

/** Normalise un code postal (trim + padStart) */
export function normCP(val: string | number | null | undefined): string {
  return String(val ?? '').trim().padStart(5, '0')
}

/** Normalise une date ADEME (ISO ou DD/MM/YYYY) → 'YYYY-MM-DD' ou null */
export function toIsoDate(val: string | null | undefined): string | null {
  if (!val) return null
  const s = String(val).trim()
  // Format ISO : 2024-01-15 ou 2024-01-15T...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // Format français : 15/01/2024 ou 15-01-2024
  const m = s.match(/^(\d{2})[/\-](\d{2})[/\-](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

/** Normalise un nom de voie pour le matching textuel */
export function normalizeVoie(voie: string): string {
  let v = voie
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprimer les accents
    .trim()

  // Abréviations courantes → forme longue
  const abbrevs: [RegExp, string][] = [
    [/\br\.?\s/g,      'rue '],
    [/\bav\.?\s/g,     'avenue '],
    [/\bbd\.?\s/g,     'boulevard '],
    [/\bbld\.?\s/g,    'boulevard '],
    [/\bpl\.?\s/g,     'place '],
    [/\bimp\.?\s/g,    'impasse '],
    [/\bch\.?\s/g,     'chemin '],
    [/\ball\.?\s/g,    'allee '],
    [/\brte\.?\s/g,    'route '],
    [/\bsq\.?\s/g,     'square '],
    [/\bres\.?\s/g,    'residence '],
    [/\bst\.?\s/g,     'saint '],
    [/\bste\.?\s/g,    'sainte '],
  ]

  for (const [pattern, replacement] of abbrevs) {
    v = v.replace(pattern, replacement)
  }

  // Supprimer les espaces multiples
  return v.replace(/\s+/g, ' ').trim()
}

/** Normalise un numéro de voie (supprime bis, ter, etc. pour le matching) */
export function normalizeNumero(numero: string | null | undefined): string {
  if (!numero) return ''
  return String(numero).trim().replace(/\s*(bis|ter|quater|b|t|q)\s*$/i, '').trim()
}

/** Reconstruit une adresse lisible depuis les champs ADEME */
export function buildAdresseBrute(r: Record<string, any>): string {
  const cp = normCP(r.code_postal_ban) !== '00000'
    ? normCP(r.code_postal_ban)
    : normCP(r.code_postal_brut)
  const ville = r.nom_commune_ban || ''

  let rawAddr = ''
  // 1. Adresse géocodée BAN (la plus fiable)
  if (r.adresse_ban) {
    rawAddr = String(r.adresse_ban).trim()
  }
  // 2. Reconstruction à partir des composants BAN
  else if (r.numero_voie_ban && r.nom_rue_ban) {
    rawAddr = `${r.numero_voie_ban} ${r.nom_rue_ban}`.trim()
  }
  // 3. Adresse brute du diagnostiqueur (moins fiable)
  else if (r.adresse_complete_brut) {
    rawAddr = String(r.adresse_complete_brut).trim()
  }

  // Éviter de dupliquer le CP si déjà dans l'adresse BAN
  if (rawAddr && rawAddr.includes(cp)) return rawAddr
  return [rawAddr, cp, ville].filter(Boolean).join(' ').trim()
}
