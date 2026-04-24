'use client'

import { useState, useEffect, useRef } from 'react'
import type { Commune } from '@/types/database'

interface Props {
  commune: Commune
  onRemove: (code_insee: string) => void
}

interface Statut {
  chargee: boolean
  chargee_at: string | null
  nb_adresses: number
}

export function CommuneCard({ commune, onRemove }: Props) {
  const [statut, setStatut]     = useState<Statut | null>(null)
  const [removing, setRemoving] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const ingestAttempts = useRef(0)

  async function triggerIngest() {
    if (ingesting) return
    setIngesting(true)
    ingestAttempts.current += 1
    try {
      const r = await fetch('/api/ingestion/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_insee: commune.code_insee, commune_id: commune.id }),
      })
      if (!r.ok) {
        console.error('[BAN] erreur HTTP', r.status, 'pour', commune.nom)
      }
    } catch(e) {
      console.error('[BAN] ingestion error:', e)
    } finally {
      setIngesting(false)
    }
  }

  useEffect(() => {
    let pollTimer: NodeJS.Timeout
    let retryTimer: NodeJS.Timeout

    async function fetchStatut() {
      try {
        const res = await fetch(`/api/communes/statut?code_insee=${commune.code_insee}`)
        const data = await res.json()
        setStatut(data)
        if (!data.chargee) {
          // Lancer l'ingestion au premier poll, puis toutes les 30s
          if (ingestAttempts.current === 0) {
            triggerIngest()
          }
          pollTimer = setTimeout(fetchStatut, 3000)
        }
      } catch(e) {
        pollTimer = setTimeout(fetchStatut, 5000)
      }
    }

    // Relancer l'ingestion toutes les 30s si toujours pas chargée
    function scheduleRetry() {
      retryTimer = setTimeout(() => {
        if (statut && !statut.chargee) {
          triggerIngest()
        }
        scheduleRetry()
      }, 30000)
    }

    fetchStatut()
    scheduleRetry()

    return () => {
      clearTimeout(pollTimer)
      clearTimeout(retryTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commune.code_insee, commune.id])

  async function handleRemove() {
    setRemoving(true)
    await fetch(`/api/communes?code_insee=${commune.code_insee}`, { method: 'DELETE' })
    onRemove(commune.code_insee)
  }

  const chargee = statut?.chargee ?? !!commune.chargee_at

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', background: '#fff',
      border: '1.5px solid #e8e7e0', borderRadius: 10, transition: 'border-color 0.2s',
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
        background: chargee ? '#1D9E75' : '#EF9F27',
        boxShadow: chargee ? '0 0 0 3px rgba(29,158,117,0.15)' : '0 0 0 3px rgba(239,159,39,0.15)',
      }}/>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: '0.9375rem', color: '#1a1a18' }}>
          {commune.nom}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#9b9b96', marginTop: 2 }}>
          {commune.code_postal ?? commune.code_insee} · Dép. {commune.departement}
          {statut && (
            chargee
              ? ` · ${statut.nb_adresses.toLocaleString('fr-FR')} adresses`
              : ' · Chargement en cours…'
          )}
        </div>
      </div>

      {!chargee && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#BA7517', fontWeight: 500 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            border: '2px solid #EF9F27', borderTopColor: 'transparent',
            animation: 'spin 0.7s linear infinite',
          }}/>
          BAN…
        </div>
      )}

      <button
        onClick={handleRemove}
        disabled={removing}
        title="Retirer cette commune"
        style={{
          width: 32, height: 32, borderRadius: 8,
          border: '1px solid #e8e7e0', background: 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, color: '#9b9b96', transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#fecaca'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#E24B4A'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e8e7e0'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#9b9b96'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  )
}
