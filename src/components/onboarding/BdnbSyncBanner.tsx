'use client'

import { useState } from 'react'
import type { CommuneProgress, SyncStatus } from '@/hooks/useBdnbSync'

const C = {
  card:    '#141416',
  border:  'rgba(255,255,255,0.06)',
  borderl: 'rgba(255,255,255,0.12)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  primary: '#1D9E75',
  warning: '#F59E0B',
  error:   '#EF4444',
  success: '#22C55E',
}

function StatusDot({ status }: { status: SyncStatus }) {
  const styles: Record<SyncStatus, { bg: string; animate?: boolean }> = {
    pending:   { bg: C.muted },
    ingesting: { bg: C.warning, animate: true },
    matching:  { bg: '#818CF8', animate: true },
    done:      { bg: C.success },
    error:     { bg: C.error },
  }
  const s = styles[status]
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      background: s.bg,
      boxShadow: s.animate ? `0 0 0 3px ${s.bg}33` : undefined,
      animation: s.animate ? 'pulse 1.5s ease-in-out infinite' : undefined,
    }} />
  )
}

function StatusLabel({ status }: { status: SyncStatus }) {
  const labels: Record<SyncStatus, string> = {
    pending:   'En attente',
    ingesting: 'Bâtiments…',
    matching:  'Matching…',
    done:      'Terminé',
    error:     'Erreur',
  }
  const colors: Record<SyncStatus, string> = {
    pending:   C.muted,
    ingesting: C.warning,
    matching:  '#818CF8',
    done:      C.success,
    error:     C.error,
  }
  return <span style={{ fontSize: '0.7rem', color: colors[status], fontWeight: 500 }}>{labels[status]}</span>
}

interface Props {
  progress:   Record<string, CommuneProgress>
  isRunning:  boolean
  total:      number
  done:       number
  percent:    number
  allDone:    boolean
  hasError:   boolean
  communes:   { code_insee: string; nom: string; chargee_at: string | null }[]
}

export function BdnbSyncBanner({ progress, isRunning, total, done, percent, allDone, hasError, communes }: Props) {
  const [expanded, setExpanded] = useState(false)

  const chargees = communes.filter(c => c.chargee_at)
  if (chargees.length === 0) return null

  // Don't show banner if everything is done and user hasn't expanded
  if (allDone && !expanded) return null

  const totalBatiments  = Object.values(progress).reduce((s, p) => s + p.batiments_ingeres, 0)
  const totalAdresses   = Object.values(progress).reduce((s, p) => s + p.adresses_matchees, 0)

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.borderl}`,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: allDone ? 'rgba(34,197,94,0.15)' : 'rgba(249,168,37,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {allDone ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.warning} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: isRunning ? 'spin 1.5s linear infinite' : undefined }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          )}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
            {allDone
              ? `Données BDNB chargées · ${totalAdresses.toLocaleString('fr-FR')} adresses enrichies`
              : `Chargement BDNB en cours · ${done}/${total} communes`
            }
          </div>
          {!allDone && (
            <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: 2 }}>
              {totalBatiments > 0 && `${totalBatiments.toLocaleString('fr-FR')} bâtiments ingérés`}
            </div>
          )}
        </div>

        {/* Percent + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!allDone && (
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: C.primary }}>{percent}%</span>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      {!allDone && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', margin: '0 14px 0' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: `linear-gradient(90deg, ${C.primary}, #34D399)`,
            width: `${percent}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}

      {/* Warning banner: keep tab open */}
      {isRunning && !expanded && (
        <div style={{
          padding: '6px 14px 8px',
          fontSize: '0.7rem',
          color: C.warning,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          Laissez cet onglet ouvert · reprise automatique si vous le fermez
        </div>
      )}

      {/* Expanded: per-commune list */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 0' }}>
          {chargees.map(commune => {
            const p = progress[commune.code_insee]
            const status: SyncStatus = p?.status ?? 'pending'
            return (
              <div key={commune.code_insee} style={{
                padding: '7px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <StatusDot status={status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', color: C.text, fontWeight: 500 }}>{commune.nom}</div>
                  {p && status === 'done' && (
                    <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: 1 }}>
                      {p.batiments_ingeres.toLocaleString('fr-FR')} bâtiments
                      {p.adresses_matchees > 0 && ` · ${p.adresses_matchees.toLocaleString('fr-FR')} adresses liées`}
                    </div>
                  )}
                  {p && status === 'ingesting' && p.batiments_ingeres > 0 && (
                    <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: 1 }}>
                      {p.batiments_ingeres.toLocaleString('fr-FR')} bâtiments…
                    </div>
                  )}
                  {p?.error_message && (
                    <div style={{ fontSize: '0.7rem', color: C.error, marginTop: 1 }}>{p.error_message}</div>
                  )}
                </div>
                <StatusLabel status={status} />
              </div>
            )
          })}

          {isRunning && (
            <div style={{
              margin: '6px 14px 2px',
              padding: '7px 10px',
              borderRadius: 7,
              background: 'rgba(249,168,37,0.08)',
              border: '1px solid rgba(249,168,37,0.15)',
              fontSize: '0.72rem', color: C.warning,
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              </svg>
              <span>
                <strong>Laissez cet onglet ouvert</strong> pendant le chargement.
                Si vous le fermez, le chargement reprendra automatiquement à l'étape suivante à votre retour.
              </span>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes pulse  { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
      `}</style>
    </div>
  )
}
