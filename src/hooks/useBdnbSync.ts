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
  const [progress, setProgress] = useState<Record<string, CommuneProgress>>({})
  const [isRunning, setIsRunning]   = useState(false)
  const abortRef   = useRef(false)
  const supabase   = createClient()

  // Load persisted progress from Supabase
  const loadProgress = useCallback(async () => {
    const insees = communes.map(c => c.code_insee)
    if (insees.length === 0) return
    const { data } = await supabase
      .from('bdnb_sync_progress')
      .select('*')
      .in('code_insee', insees)
    if (!data) return
    const map: Record<string, CommuneProgress> = {}
    for (const row of data) map[row.code_insee] = row as CommuneProgress
    setProgress(map)
  }, [communes.map(c => c.code_insee).join(',')])

  // Persist a single commune progress row
  const saveProgress = useCallback(async (p: CommuneProgress) => {
    setProgress(prev => ({ ...prev, [p.code_insee]: p }))
    await supabase.from('bdnb_sync_progress').upsert({
      ...p,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'code_insee' })
  }, [])

  // Full sync loop for one commune
  const syncCommune = useCallback(async (commune: Commune, initial: CommuneProgress | undefined): Promise<void> => {
    const base: CommuneProgress = initial ?? {
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

    let cur = { ...base, status: 'ingesting' as SyncStatus, started_at: base.started_at ?? new Date().toISOString() }
    await saveProgress(cur)

    // ── Phase 1 : ingest batiments ──────────────────────────────
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
      cur = {
        ...cur,
        status:            'done',
        adresses_matchees: match.total_matched ?? 0,
        error_message:     null,
      }
    } catch (e: any) {
      cur = { ...cur, status: 'error', error_message: `Matching: ${e.message}` }
    }

    await saveProgress(cur)
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
      // Load persisted progress first
      const insees = chargees.map(c => c.code_insee)
      const { data } = await supabase
        .from('bdnb_sync_progress')
        .select('*')
        .in('code_insee', insees)

      if (cancelled) return

      const map: Record<string, CommuneProgress> = {}
      for (const row of (data ?? [])) map[row.code_insee] = row as CommuneProgress
      setProgress(map)

      // Filter communes that still need work
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

  return { progress, isRunning, total, done, percent, allDone, hasError, loadProgress }
}
