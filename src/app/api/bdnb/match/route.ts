import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClientDirect } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

// ══════════════════════════════════════════════════════════════════
// POST /api/bdnb/match
//
// Matching adresses ↔ BDNB pour une commune en cinq passes :
//   1. Clé BAN (id = cle_interop_adr_principale_ban ou dans l_cle_interop_adr)
//   2. Fallback spatial (bâtiment le plus proche ≤ 30 m)
//   3. Fallback texte (numero + nom_voie normalisés vs libelle_adr_principale_ban)
//   4. Fallback tableau (tous les libellés dans l_libelle_adr JSONB)
//   5. Fallback lieu-dit (adresses sans numéro, correspondance unique dans la commune)
//
// Body : { code_insee }
// Retourne : { ok, matched_ban, matched_spatial, matched_text, matched_array, matched_lieu_dit, total_matched }
// ══════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  const key = request.headers.get('x-internal-key')
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user && key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.code_insee) {
    return NextResponse.json({ error: 'code_insee requis' }, { status: 400 })
  }

  const { code_insee } = body

  const supabase = createAdminClientDirect<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    console.log(`[BDNB] Matching adresses pour ${code_insee}...`)

    // ── Passe 1 : matching par clé BAN ───────────────────────────
    const { data: banCount, error: banError } = await supabase
      .rpc('match_bdnb_by_ban_key', { p_code_insee: code_insee })

    if (banError) {
      console.error('[BDNB] Erreur passe BAN:', banError.message, banError.code)
    }
    const matched_ban: number = banCount ?? 0
    console.log(`[BDNB] Passe 1 (BAN) : ${matched_ban} adresses liées`)

    // ── Passe 2 : fallback spatial 30 m ──────────────────────────
    const { data: spatialCount, error: spatialError } = await supabase
      .rpc('match_bdnb_by_proximity', { p_code_insee: code_insee })

    if (spatialError) {
      console.error('[BDNB] Erreur passe spatiale:', spatialError.message, spatialError.code)
    }
    const matched_spatial: number = spatialCount ?? 0
    console.log(`[BDNB] Passe 2 (spatial 30 m) : ${matched_spatial} adresses liées`)

    // ── Passe 3 : fallback texte (numero + nom_voie) ─────────────
    const { data: textCount, error: textError } = await supabase
      .rpc('match_bdnb_by_address_text', { p_code_insee: code_insee })

    if (textError) {
      console.error('[BDNB] Erreur passe texte:', textError.message, textError.code)
    }
    const matched_text: number = textCount ?? 0
    console.log(`[BDNB] Passe 3 (texte) : ${matched_text} adresses liées`)

    // ── Passe 4 : fallback tableau l_libelle_adr ──────────────────
    const { data: arrayCount, error: arrayError } = await supabase
      .rpc('match_bdnb_by_libelle_array', { p_code_insee: code_insee })

    if (arrayError) {
      console.error('[BDNB] Erreur passe tableau:', arrayError.message, arrayError.code)
    }
    const matched_array: number = arrayCount ?? 0
    console.log(`[BDNB] Passe 4 (tableau) : ${matched_array} adresses liées`)

    // ── Passe 5 : fallback lieu-dit (sans numéro) ─────────────────
    const { data: lieuDitCount, error: lieuDitError } = await supabase
      .rpc('match_bdnb_by_lieu_dit', { p_code_insee: code_insee })

    if (lieuDitError) {
      console.error('[BDNB] Erreur passe lieu-dit:', lieuDitError.message, lieuDitError.code)
    }
    const matched_lieu_dit: number = lieuDitCount ?? 0
    console.log(`[BDNB] Passe 5 (lieu-dit) : ${matched_lieu_dit} adresses liées`)

    const total_matched = matched_ban + matched_spatial + matched_text + matched_array + matched_lieu_dit
    console.log(`[BDNB] ✓ Total matching ${code_insee} : ${total_matched} adresses enrichies`)

    return NextResponse.json({
      ok: true,
      matched_ban,
      matched_spatial,
      matched_text,
      matched_array,
      matched_lieu_dit,
      total_matched,
      errors: {
        ban:      banError      ? { code: banError.code,      message: banError.message      } : null,
        spatial:  spatialError  ? { code: spatialError.code,  message: spatialError.message  } : null,
        text:     textError     ? { code: textError.code,     message: textError.message     } : null,
        array:    arrayError    ? { code: arrayError.code,    message: arrayError.message    } : null,
        lieu_dit: lieuDitError  ? { code: lieuDitError.code,  message: lieuDitError.message  } : null,
      },
    })

  } catch (err: any) {
    console.error(`[BDNB] Erreur matching:`, err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
