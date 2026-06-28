// GET /api/dvf/debug — teste l'accès à l'API DVF tabulaire
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { DVF_BASE, DVF_RESOURCE_ID } from '@/lib/dvf/client'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const results: Record<string, any> = { resource_id: DVF_RESOURCE_ID }

  // Test 1 : sans filtre
  const url1 = `${DVF_BASE}/resources/${DVF_RESOURCE_ID}/data/?page=1&page_size=1`
  try {
    const r = await fetch(url1, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    const body = await r.text()
    let json: any = null; try { json = JSON.parse(body) } catch (_) {}
    results.test_sans_filtre = { status: r.status, ok: r.ok, body: json ?? body.slice(0, 500) }
  } catch (e: any) { results.test_sans_filtre = { erreur: e.message } }

  // Test 2 : avec filtre code_commune
  const url2 = `${DVF_BASE}/resources/${DVF_RESOURCE_ID}/data/?code_commune__exact=22221&page=1&page_size=1`
  try {
    const r = await fetch(url2, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    const body = await r.text()
    let json: any = null; try { json = JSON.parse(body) } catch (_) {}
    results.test_avec_filtre = { status: r.status, ok: r.ok, body: json ?? body.slice(0, 500) }
  } catch (e: any) { results.test_avec_filtre = { erreur: e.message } }

  return NextResponse.json(results)
}
