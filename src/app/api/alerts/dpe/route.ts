import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

// GET — données pour le dashboard (DPE récents depuis dernière alerte)
export async function GET(req: Request) {
  const supabase = await createAdminClient()

  // Récupérer l'utilisateur connecté via le cookie (client normal)
  const { createClient } = await import('@/lib/supabase/server')
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  // Récupérer last_dpe_alert_at du commercial
  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('last_dpe_alert_at, email')
    .eq('id', user.id)
    .single()

  const since = commercial?.last_dpe_alert_at ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  // Communes du commercial
  const { data: communes } = await supabase
    .from('communes_commerciaux')
    .select('code_insee, nom, code_postal')
    .eq('commercial_id', user.id)

  if (!communes?.length) return NextResponse.json({ dpe: [], since })

  const codeInsees = communes.map((c: any) => c.code_insee)

  // DPE récents depuis dernière alerte, joints avec adresses
  const { data: dpes } = await supabase
    .from('dpe_logements')
    .select('id, adresse_id, date_etablissement_dpe, classe_energie, adresses(id, numero, nom_voie, code_postal, commune, code_insee)')
    .in('adresses.code_insee', codeInsees)
    .gte('date_etablissement_dpe', since)
    .not('adresse_id', 'is', null)
    .order('date_etablissement_dpe', { ascending: false })
    .limit(200)

  // Grouper par commune
  const byCommune: Record<string, any[]> = {}
  for (const dpe of (dpes ?? [])) {
    if (!dpe.adresses) continue
    const commune = (dpe.adresses as any).commune ?? 'Inconnue'
    if (!byCommune[commune]) byCommune[commune] = []
    byCommune[commune].push({
      adresse_id: dpe.adresse_id,
      adresse: [(dpe.adresses as any).numero, (dpe.adresses as any).nom_voie].filter(Boolean).join(' '),
      code_postal: (dpe.adresses as any).code_postal,
      commune,
      classe: dpe.classe_energie,
      date: dpe.date_etablissement_dpe,
    })
  }

  const total = Object.values(byCommune).reduce((s, a) => s + a.length, 0)
  return NextResponse.json({ dpe: byCommune, total, since })
}

// POST — envoi du mail hebdomadaire (appelé par le cron)
export async function POST(req: Request) {
  const supabase = await createAdminClient()

  // Vérifier le secret cron
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Récupérer tous les commerciaux actifs avec leurs communes
  const { data: commerciaux } = await supabase
    .from('commerciaux')
    .select('id, prenom, nom, email, last_dpe_alert_at')
    .not('email', 'is', null)

  if (!commerciaux?.length) return NextResponse.json({ sent: 0 })

  const transport = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 587,
    auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
  })

  let sent = 0
  const now = new Date().toISOString()

  for (const commercial of commerciaux) {
    const since = commercial.last_dpe_alert_at ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

    const { data: communes } = await supabase
      .from('communes_commerciaux')
      .select('code_insee, nom')
      .eq('commercial_id', commercial.id)

    if (!communes?.length) continue

    const codeInsees = communes.map((c: any) => c.code_insee)

    const { data: dpes } = await supabase
      .from('dpe_logements')
      .select('date_etablissement_dpe, classe_energie, adresses(numero, nom_voie, code_postal, commune, code_insee)')
      .in('adresses.code_insee', codeInsees)
      .gte('date_etablissement_dpe', since)
      .not('adresse_id', 'is', null)
      .order('date_etablissement_dpe', { ascending: false })
      .limit(500)

    const relevant = (dpes ?? []).filter((d: any) => d.adresses)
    if (!relevant.length) continue

    // Grouper par commune
    const byCommune: Record<string, string[]> = {}
    for (const dpe of relevant) {
      const a = dpe.adresses as any
      const key = a.commune ?? 'Inconnue'
      if (!byCommune[key]) byCommune[key] = []
      byCommune[key].push(`${a.numero ?? ''} ${a.nom_voie ?? ''} (${a.code_postal ?? ''}) — DPE ${dpe.classe_energie ?? '?'}`.trim())
    }

    // Construire l'email HTML
    const sinceFmt = new Date(since).toLocaleDateString('fr-FR')
    const rows = Object.entries(byCommune).map(([ville, adrs]) =>
      `<tr><td colspan="2" style="padding:10px 12px 4px;font-weight:700;color:#1D9E75;border-top:1px solid #E8E6DF">${ville} (${adrs.length})</td></tr>` +
      adrs.map(a => `<tr><td style="padding:3px 12px 3px 24px;font-size:13px;color:#374151">• ${a}</td></tr>`).join('')
    ).join('')

    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#F8F7F4;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #E8E6DF;overflow:hidden">
  <div style="background:#1D9E75;padding:20px 24px">
    <div style="color:#fff;font-size:20px;font-weight:700">PROspector — Nouveaux DPE</div>
    <div style="color:#a7f3d0;font-size:13px;margin-top:4px">Depuis le ${sinceFmt} · ${relevant.length} DPE detectes</div>
  </div>
  <div style="padding:20px 24px">
    <p style="color:#374151;font-size:14px">Bonjour ${commercial.prenom ?? 'Commercial'},</p>
    <p style="color:#374151;font-size:14px">Voici les nouveaux DPE enregistres sur votre secteur depuis votre derniere alerte. Ces biens sont potentiellement en preparation de vente.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px">${rows}</table>
    <div style="margin-top:20px;text-align:center">
      <a href="https://prospector-sooty-seven.vercel.app/zones?filter=dpe_recent" style="display:inline-block;padding:10px 20px;background:#1D9E75;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Voir sur la carte</a>
    </div>
  </div>
  <div style="padding:12px 24px;background:#F8F7F4;font-size:11px;color:#9ca3af;text-align:center">PROspector · Square Habitat</div>
</div></body></html>`

    try {
      await transport.sendMail({
        from: 'PROspector <noreply@prospector.squarehabitat.fr>',
        to: commercial.email,
        subject: `PROspector — ${relevant.length} nouveau${relevant.length > 1 ? 'x' : ''} DPE sur votre secteur`,
        html,
      })
      sent++
    } catch (e) {
      console.error('Mail error for', commercial.email, e)
    }

    // Mettre à jour last_dpe_alert_at
    await supabase.from('commerciaux').update({ last_dpe_alert_at: now }).eq('id', commercial.id)
  }

  return NextResponse.json({ sent, total_commerciaux: commerciaux.length })
}
