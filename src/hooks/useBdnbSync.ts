'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type SyncStatus = 'pending' | 'ingesting' | 'matching' | 'done' | 'error'

export interface CommuneProgress {
  code_insee:        string
  nom:               string
  status:            SyncStatus
  batiments_ingeres: number
  next_offset:       number
  adresses_matchees: number
  error_message:     string | null
}

interface Commune {
  code_insee: string
  nom:        string
  chargee_at: string | null
}

const DELAY_BETWEEN_PAGES    = 700  // ms — stay under 120 req/min BDNB limit
const DELAY_BETWEEN_COMMUNES = 1000 // ms

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export function useBdnbSync(communes: Commune[]) {
  const [progress, setProgress]   = useState<Record<string, CommuneProgress>>({})
  const [isRunning, setIsRunning] = useState(false)
  const abortRef  = useRef(false)
  const userIdRef = useRef<string | null>(null)
  // Bug fix 4 : créer le client Supabase une seule fois
  const supabaseRef = useRef(createClient())

  // Resolve and cache the current user id
  const getUserId = useCallback(async (): Promise<string | null> => {
    if (userIdRef.current) return userIdRef.current
    const { data: { user } } = await supabaseRef.current.auth.getUser()
    userIdRef.current = user?.id ?? null
    return userIdRef.current
  }, [])

  // Persist a single commune progress row (scoped to current user)
  // Bug fix 3 : vérifier et logger les erreurs du upsert
  const saveProgress = useCallback(async (p: CommuneProgress & { started_at?: string }) => {
    setProgress(prev => ({ ...prev, [p.code_insee]: p }))
    const userId = await getUserId()
    if (!userId) return
    const { error } = await (supabaseRef.current as any).from('bdnb_sync_progress').upsert({
      user_id:           userId,
      code_insee:        p.code_insee,
      nom:               p.nom,
      status:            p.status,
      batiments_ingeres: Number(p.batiments_ingeres) || 0,
      next_offset:       Number(p.next_offset) || 0,
      adresses_matchees: Number(p.adresses_matchees) || 0,
      error_message:     p.error_message ?? null,
      started_at:        (p as any).started_at ?? null,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'user_id,code_insee' })
    if (error) {
      console.error('[useBdnbSync] saveProgress upsert error:', error.message, '— code_insee:', p.code_insee, 'status:', p.status)
    }
  }, [getUserId])

  // Full sync loop for one commune
  const syncCommune = useCallback(async (commune: Commune, initial: CommuneProgress | undefined): Promise<void> => {
    const base: CommuneProgress & { started_at?: string } = initial ?? {
      code_insee:        commune.code_insee,
      nom:               commune.nom,
      status:            'pending',
      batiments_ingeres: 0,
      next_offset:       0,
      adresses_matchees: 0,
      error_message:     null,
    }

    // Already done — skip
    if (base.status === 'done') return

    // Bug fix 2 : si le statut est 'matching', l'ingestion est déjà complète.
    // On saute la Phase 1 et on va directement au matching pour finaliser.
    const skipIngestion = base.status === 'matching'

    let cur: CommuneProgress & { started_at?: string } = { ...base, status: 'ingesting' as SyncStatus, started_at: base.started_at ?? new Date().toISOString() }
    if (!skipIngestion) {
      await saveProgress(cur)
    }

    // ── Phase 1 : ingest batiments ──────────────────────────────
    if (!skipIngestion) {
      let offset = cur.next_offset
      let pages  = 0
      const MAX_PAGES = 200 // safety ceiling per commune session

      while (pages < MAX_PAGES) {
        if (abortRef.current) return

        let ingest: any
        try {
          const res = await fetch('/api/bdnb/ingest', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ code_insee: commune.code_insee, nom: commune.nom, start_offset: offset }),
          })
          ingest = await res.json()
        } catch (e: any) {
          // Network error — save state and bail (will resume on next mount)
          await saveProgress({ ...cur, status: 'ingesting', next_offset: offset, error_message: e.message })
          return
        }

        if (ingest.upsert_error) {
          await saveProgress({ ...cur, status: 'error', next_offset: offset, error_message: ingest.upsert_error })
          return
        }

        cur = {
          ...cur,
          batiments_ingeres: cur.batiments_ingeres + (ingest.count ?? 0),
          next_offset: ingest.next_offset ?? offset,
        }
        await saveProgress(cur)

        if (!ingest.next_offset) break // no more pages

        offset = ingest.next_offset
        pages++
        await sleep(DELAY_BETWEEN_PAGES)
      }
    } else {
      // Récupérer les compteurs depuis le snapshot DB existant
      cur = { ...base }
    }

    if (abortRef.current) return

    // ── Phase 2 : matching adresses ─────────────────────────────
    cur = { ...cur, status: 'matching', next_offset: 0 }
    await saveProgress(cur)

    try {
      const res   = await fetch('/api/bdnb/match', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code_insee: commune.code_insee }),
      })
      const match = await res.json()

      // Enrichir type_bien depuis BDNB (passe silencieuse — non bloquante)
      fetch('/api/adresses/prequalifier', { method: 'POST' }).catch(() => {})

      cur = {
        ...cur,
        status:            'done',
        adresses_matchees: match.total_matched ?? 0,
        error_message:     null,
      }
    } catch (e: any) {
      cur = { ...cur, status: 'error', error_message: `Matching: ${e.message}` }
    }

    // Sauvegarder le statut final avec retry en cas d'échec réseau
    let saved = false
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      try {
        await saveProgress(cur)
        saved = true
      } catch {
        if (attempt < 2) await sleep(1000)
      }
    }
  }, [saveProgress])

  // Run full sync for all communes that need it
  const runSync = useCallback(async (communesToSync: Commune[], currentProgress: Record<string, CommuneProgress>) => {
    setIsRunning(true)
    abortRef.current = false

    for (const commune of communesToSync) {
      if (abortRef.current) break
      const p = currentProgress[commune.code_insee]
      if (p?.status === 'done') continue
      await syncCommune(commune, p)
      await sleep(DELAY_BETWEEN_COMMUNES)
    }

    setIsRunning(false)
  }, [syncCommune])

  // Start / resume sync when loaded communes change
  useEffect(() => {
    const chargees = communes.filter(c => c.chargee_at)
    if (chargees.length === 0) return

    let cancelled = false

    const init = async () => {
      const userId = await getUserId()
      if (!userId || cancelled) return

      const insees = chargees.map(c => c.code_insee)
      const { data, error } = await (supabaseRef.current as any)
        .from('bdnb_sync_progress')
        .select('*')
        .eq('user_id', userId)
        .in('code_insee', insees)

      if (error) {
        console.error('[useBdnbSync] Erreur lecture progress:', error.message)
      }

      if (cancelled) return

      const map: Record<string, CommuneProgress> = {}
      for (const row of (data ?? []) as any[]) map[row.code_insee] = row as CommuneProgress
      setProgress(map)

      // Filter communes that still need work
      // 'matching' est considéré incomplet (le matching peut être retenté)
      const pending = chargees.filter(c => {
        const p = map[c.code_insee]
        return !p || p.status !== 'done'
      })

      if (pending.length > 0 && !cancelled) {
        runSync(pending, map)
      }
    }

    init()
    return () => { cancelled = true; abortRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communes.filter(c => c.chargee_at).map(c => c.code_insee).join(',')])

  // Derived stats
  const total    = communes.filter(c => c.chargee_at).length
  const done     = Object.values(progress).filter(p => p.status === 'done').length
  const hasError = Object.values(progress).some(p => p.status === 'error')
  const percent  = total === 0 ? 0 : Math.round((done / total) * 100)
  const allDone  = total > 0 && done === total

  return { progress, isRunning, total, done, percent, allDone, hasError, loadProgress: async () => {} }
}
