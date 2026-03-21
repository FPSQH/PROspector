'use client'

import { useState, useEffect } from 'react'
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
  const [statut, setStatut] = useState<Statut | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let interval: NodeJS.Timeout

    async function fetchStatut() {
      const res = await fetch(`/api/communes/statut?code_insee=${commune.code_insee}`)
      const data = await res.json()
      setStatut(data)
      // Continuer à poller si pas encore chargée
      if (!data.chargee) {
        interval = setTimeout(fetchStatut, 3000)
      }
    }

    fetchStatut()
    return () => clearTimeout(interval)
  }, [commune.code_insee])

  async function handleRemove() {
    setRemoving(true)
    await fetch(`/api/communes?code_insee=${commune.code_insee}`, { method: 'DELETE' })
    onRemove(commune.code_insee)
  }

  const chargee = statut?.chargee ?? !!commune.chargee_at

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 14px',
      background: '#fff',
      border: '1.5px solid #e8e7e0',
      borderRadius: 10,
      transition: 'border-color 0.2s',
    }}>
      {/* Indicateur statut */}
      <div style={{
        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
        background: chargee ? '#1D9E75' : '#EF9F27',
        boxShadow: chargee ? '0 0 0 3px rgba(29,158,117,0.15)' : '0 0 0 3px rgba(239,159,39,0.15)',
      }}/>

      {/* Infos commune */}
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

      {/* Badge chargement */}
      {!chargee && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.75rem', color: '#BA7517', fontWeight: 500,
        }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            border: '2px solid #EF9F27', borderTopColor: 'transparent',
            animation: 'spin 0.7s linear infinite',
          }}/>
          BAN…
        </div>
      )}

      {/* Bouton supprimer */}
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
          (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#fecaca'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#E24B4A'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
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
