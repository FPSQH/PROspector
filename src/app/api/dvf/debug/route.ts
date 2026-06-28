// GET /api/dvf/debug — teste l'accès à l'API DVF tabulaire (admin uniquement)
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { DVF_BASE, DVF_RESOURCE_ID } from '@/lib/dvf/client'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const testUrl = `${DVF_BASE}/resources/${DVF_RESOURCE_ID}/data/?page=1&page_size=1`

  try {
    const resp = await fetch(testUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    const text = await resp.text()
    let json: any = null
    try { json = JSON.parse(text) } catch (_) {}

    return NextResponse.json({
      resource_id: DVF_RESOURCE_ID,
      url_testee: testUrl,
      status_http: resp.status,
      status_ok: resp.ok,
      reponse_brute: json ?? text.slice(0, 500),
    })
  } catch (err: any) {
    return NextResponse.json({
      resource_id: DVF_RESOURCE_ID,
      url_testee: testUrl,
      erreur: err.message,
      type: err.constructor?.name,
    })
  }
}
