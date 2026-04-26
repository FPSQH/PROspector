import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateLetterHTML } from '@/lib/lettres/generator'

// POST /api/courriers/docx
// Body: { letters: [{adresse, html}], date_debut, date_fin }
// Génère un fichier HTML multi-pages stylisé pour impression / Word

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await request.json()
  const { letters = [], date_debut, date_fin } = body

  if (!letters.length) return NextResponse.json({ error: 'Aucune lettre' }, { status: 400 })

  // Récupérer les infos agent pour l'en-tête
  const adminDb = createAdminClient()
  const { data: commercial } = await adminDb
    .from('commerciaux')
    .select('nom, prenom, agence_nom, agence_adresse, agence_telephone, agence_email')
    .eq('user_id', user.id)
    .single()

  const agenceNom  = commercial?.agence_nom  ?? 'Square Habitat'
  const agenceAdr  = commercial?.agence_adresse  ?? ''
  const agenceTel  = commercial?.agence_telephone ?? ''
  const agentNom   = `${commercial?.prenom ?? ''} ${commercial?.nom ?? ''}`.trim()
  const today      = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })

  // Construire un HTML multi-pages avec saut de page entre chaque lettre
  const pagesHtml = letters.map((l: any) => `
    <div class="page">
      <header class="page-header">
        <div class="agence-info">
          <div class="agence-nom">${agenceNom}</div>
          ${agenceAdr ? `<div class="agence-adr">${agenceAdr}</div>` : ''}
          ${agenceTel ? `<div class="agence-tel">📞 ${agenceTel}</div>` : ''}
        </div>
        <div class="agent-info">
          <div class="agent-nom">${agentNom}</div>
          <div class="agent-label">Conseiller Immobilier</div>
        </div>
      </header>
      <div class="letter-body">
        ${l.html}
      </div>
    </div>
  `).join('<div class="page-break"></div>')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Courriers DPE — ${date_debut} au ${date_fin}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #1a1a18; background: #fff; }
  .page { max-width: 750px; margin: 0 auto; padding: 40px 50px; min-height: 1050px; }
  .page-break { page-break-after: always; height: 0; }
  .page-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 20px; margin-bottom: 28px;
    border-bottom: 3px solid #1D9E75;
  }
  .agence-nom { font-size: 18px; font-weight: 700; color: #1D9E75; margin-bottom: 4px; }
  .agence-adr, .agence-tel { font-size: 12px; color: #5F5E5A; margin-top: 2px; }
  .agent-info { text-align: right; }
  .agent-nom { font-size: 14px; font-weight: 600; color: #1a1a18; }
  .agent-label { font-size: 11px; color: #9b9b96; margin-top: 2px; }
  .letter-body { font-size: 13px; line-height: 1.75; }
  .letter-body h4 { font-size: 12px; font-weight: 700; color: #1D9E75; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; }
  .letter-body p { margin-bottom: 12px; }
  @media print {
    .page { margin: 0; padding: 25px 35px; }
    .page-break { page-break-after: always; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'application/vnd.ms-word;charset=utf-8',
      'Content-Disposition': `attachment; filename="courriers-dpe-${date_debut}-${date_fin}.doc"`,
    }
  })
}
