import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getDpeRecents(supabase: any, commercialId: string, since: string) {
  // Communes du commercial
  const { data: communes } = await supabase
    .from('communes')
    .select('code_insee, nom')
    .eq('commercial_id', commercialId)

  if (!communes?.length) return { byCommune: {}, total: 0 }

  const codeInsees = communes.map((c: any) => c.code_insee)

  // Requete directe : dpe_logement -> adresses filtrées par code_insee
  // On passe par une vue SQL pour eviter la limite 1000 lignes
  const { data: dpes } = await supabase
    .from('dpe_logement')
    .select(`
      adresse_id,
      date_etablissement,
      etiquette_dpe,
      adresses!inner(id, numero, nom_voie, code_postal, commune, code_insee)
    `)
    .in('adresses.code_insee', codeInsees)
    .gte('date_etablissement', since)
    .order('date_etablissement', { ascending: false })
    .limit(500)

  const byCommune: Record<string, any[]> = {}
  for (const dpe of (dpes ?? [])) {
    const a = dpe.adresses as any
    if (!a) continue
    const key = a.commune ?? 'Inconnue'
    if (!byCommune[key]) byCommune[key] = []
    byCommune[key].push({
      adresse_id: dpe.adresse_id,
      adresse: [a.numero, a.nom_voie].filter(Boolean).join(' '),
      code_postal: a.code_postal,
      commune: key,
      classe: dpe.etiquette_dpe,
      date: dpe.date_etablissement,
    })
  }

  const total = Object.values(byCommune).reduce((s, a) => s + a.length, 0)
  return { byCommune, total }
}

export async function GET() {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const supabase = await createAdminClient()

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('last_dpe_alert_at')
    .eq('id', user.id)
    .single()

  const since = commercial?.last_dpe_alert_at
    ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const { byCommune, total } = await getDpeRecents(supabase, user.id, since)
  return NextResponse.json({ dpe: byCommune, total, since })
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createAdminClient()

  const { data: commerciaux } = await supabase
    .from('commerciaux')
    .select('id, prenom, nom, email, last_dpe_alert_at')
    .not('email', 'is', null)

  if (!commerciaux?.length) return NextResponse.json({ sent: 0 })

  let sent = 0
  const now = new Date().toISOString()

  for (const commercial of commerciaux) {
    const since = commercial.last_dpe_alert_at
      ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

    const { byCommune, total } = await getDpeRecents(supabase, commercial.id, since)
    if (!total) continue

    const sinceFmt = new Date(since).toLocaleDateString('fr-FR')
    const rows = Object.entries(byCommune).map(([ville, adrs]) =>
      `<tr><td colspan="2" style="padding:10px 12px 4px;font-weight:700;color:#1D9E75;border-top:2px solid #E8E6DF">${ville} (${adrs.length} DPE)</td></tr>` +
      adrs.map((a: any) => `<tr><td style="padding:3px 12px 3px 24px;font-size:13px;color:#374151">• ${a.adresse} (${a.code_postal}) — DPE ${a.classe ?? '?'} — ${new Date(a.date).toLocaleDateString('fr-FR')}</td></tr>`).join('')
    ).join('')

    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#F8F7F4;padding:24px;margin:0">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #E8E6DF;overflow:hidden">
  <div style="background:#1D9E75;padding:20px 24px">
    <div style="color:#fff;font-size:20px;font-weight:700">&#128203; PROspector — Nouveaux DPE</div>
    <div style="color:#a7f3d0;font-size:13px;margin-top:4px">Depuis le ${sinceFmt} · ${total} DPE detectes sur votre secteur</div>
  </div>
  <div style="padding:20px 24px">
    <p style="color:#374151;font-size:14px;margin-top:0">Bonjour ${commercial.prenom ?? 'Commercial'},</p>
    <p style="color:#374151;font-size:14px">Ces biens ont fait l&apos;objet d&apos;un nouveau DPE. Ils sont potentiellement en preparation de vente — contactez-les en priorite.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px">${rows}</table>
    <div style="margin-top:24px;text-align:center">
      <a href="https://prospector-sooty-seven.vercel.app/zones?filter=dpe_recent"
        style="display:inline-block;padding:11px 22px;background:#1D9E75;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        Voir sur la carte &#8594;
      </a>
    </div>
  </div>
  <div style="padding:12px 24px;background:#F8F7F4;font-size:11px;color:#9ca3af;text-align:center">
    PROspector · Square Habitat — Alerte automatique hebdomadaire
  </div>
</div></body></html>`

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'PROspector <onboarding@resend.dev>',
          to: [commercial.email],
          subject: `PROspector — ${total} nouveau${total > 1 ? 'x' : ''} DPE sur votre secteur`,
          html,
        }),
      })
      if (res.ok) sent++
      else console.error('Resend error:', await res.text())
    } catch (e) {
      console.error('Mail error for', commercial.email, e)
    }

    await supabase.from('commerciaux').update({ last_dpe_alert_at: now }).eq('id', commercial.id)
  }

  return NextResponse.json({ sent, total_commerciaux: commerciaux.length })
}
