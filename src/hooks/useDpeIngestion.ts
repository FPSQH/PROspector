// src/hooks/useDpeIngestion.ts
//
// Hook React pour orchestrer l'ingestion DPE côté client.
// Boucle sur /api/dpe/ingest page par page (500 DPE par appel),
// puis appelle /api/dpe/match pour le matching + qualification.
//
// Chaque appel API tient dans le timeout Vercel Hobby de 10s.

'use client'

import { useState, useCallback } from 'react'

export interface DpeStatus {
  code_insee:   string
  nom:          string
  phase:        'idle' | 'ingesting' | 'matching' | 'done' | 'error'
  nb_inserted:  number
  nb_pages:     number
  nb_matched:   number
  nb_qualified: number
  error?:       string
}

export interface CommuneForDpe {
  code_insee:  string
  nom:         string
  code_postal: string
  commune_id:  string
}

export function useDpeIngestion() {
  const [statuses, setStatuses] = useState<Map<string, DpeStatus>>(new Map())
  const [isRunning, setIsRunning] = useState(false)

  const updateStatus = useCallback((code_insee: string, updates: Partial<DpeStatus>) => {
    setStatuses(prev => {
      const next = new Map(prev)
      const current = next.get(code_insee) || {
        code_insee, nom: '', phase: 'idle' as const,
        nb_inserted: 0, nb_pages: 0, nb_matched: 0, nb_qualified: 0,
      }
      next.set(code_insee, { ...current, ...updates })
      return next
    })
  }, [])

  const ingestCommune = useCallback(async (commune: CommuneForDpe): Promise<boolean> => {
    const { code_insee, code_postal, nom, commune_id } = commune

    updateStatus(code_insee, {
      nom,
      phase: 'ingesting',
      nb_inserted: 0,
      nb_pages: 0,
      error: undefined,
    })

    try {
      // ── Phase 1 : Ingestion page par page ─────────────────────────────
      let after: string | null = null
      let totalInserted = 0
      let pageCount = 0

      while (true) {
        const res = await fetch('/api/dpe/ingest', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code_postal, code_insee, after }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          updateStatus(code_insee, { phase: 'error', error: err.error })
          return false
        }

        const data = await res.json()
        totalInserted += data.nb_inserted
        pageCount++

        updateStatus(code_insee, {
          nb_inserted: totalInserted,
          nb_pages:    pageCount,
        })

        if (!data.has_more) break
        after = data.after

        // Petit délai pour ne pas surcharger l'API ADEME
        await new Promise(r => setTimeout(r, 300))
      }

      // ── Phase 2 : Matching + qualification ────────────────────────────
      updateStatus(code_insee, { phase: 'matching' })

      const matchRes = await fetch('/api/dpe/match', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_insee, commune_id }),
      })

      if (!matchRes.ok) {
        const err = await matchRes.json().catch(() => ({ error: 'Erreur matching' }))
        updateStatus(code_insee, { phase: 'error', error: err.error })
        return false
      }

      const matchData = await matchRes.json()

      updateStatus(code_insee, {
        phase:        'done',
        nb_matched:   matchData.nb_matched_textuel + matchData.nb_matched_spatial,
        nb_qualified: matchData.nb_qualified,
      })

      return true

    } catch (err: any) {
      updateStatus(code_insee, {
        phase: 'error',
        error: err.message || 'Erreur inattendue',
      })
      return false
    }
  }, [updateStatus])

  const ingestAll = useCallback(async (communes: CommuneForDpe[]) => {
    setIsRunning(true)
    // Séquentiel pour éviter de surcharger l'API ADEME
    for (const commune of communes) {
      await ingestCommune(commune)
    }
    setIsRunning(false)
  }, [ingestCommune])

  const getStatus = useCallback((code_insee: string): DpeStatus | undefined => {
    return statuses.get(code_insee)
  }, [statuses])

  return {
    statuses,
    isRunning,
    ingestCommune,
    ingestAll,
    getStatus,
  }
}
