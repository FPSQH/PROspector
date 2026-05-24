'use client'

import { useState, useEffect } from 'react'

const FONT      = "var(--font-outfit, 'Outfit'), -apple-system, sans-serif"
const C_CARD    = '#141416'
const C_BORDER  = 'rgba(255,255,255,0.06)'
const C_BORDERL = 'rgba(255,255,255,0.10)'
const C_TEXT    = '#F0F0F2'
const C_DIM     = '#4A4A58'
const C_MUTED   = '#6B6B7B'

export function CollapsibleSection({
  id,
  title,
  badge,
  summary,
  action,
  accentColor,
  children,
}: {
  id: string
  title: string
  badge?: string
  summary: React.ReactNode
  action?: React.ReactNode
  accentColor?: string
  children: React.ReactNode
}) {
  // SSR default : open (évite le flash "pas de contenu" au premier rendu)
  const [open,    setOpen]    = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(`dash-sec-${id}`)
    if (stored !== null) {
      setOpen(stored === '1')
    } else {
      // Premier affichage : replié sur mobile, ouvert sur desktop
      const isMobile = window.innerWidth < 768
      const next = !isMobile
      setOpen(next)
      localStorage.setItem(`dash-sec-${id}`, next ? '1' : '0')
    }
  }, [id])

  const toggle = () => {
    const next = !open
    setOpen(next)
    localStorage.setItem(`dash-sec-${id}`, next ? '1' : '0')
  }

  return (
    <div style={{
      background: C_CARD,
      border: `1px solid ${C_BORDER}`,
      borderTop: accentColor ? `2px solid ${accentColor}` : undefined,
      borderRadius: 12,
      boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
      fontFamily: FONT,
      overflow: 'hidden',
    }}>
      {/* ── Header (toujours visible) ── */}
      <div
        onClick={toggle}
        style={{
          padding: '13px 18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          borderBottom: open ? `1px solid ${C_BORDERL}` : 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none' as any,
        }}
      >
        {/* Gauche : titre + badge + résumé (si replié) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C_TEXT, letterSpacing: '-0.01em', flexShrink: 0 }}>
            {title}
          </span>
          {badge && (
            <span style={{
              padding: '2px 7px', borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${C_BORDER}`,
              fontSize: 10, fontWeight: 500, color: C_DIM,
              flexShrink: 0,
            }}>
              {badge}
            </span>
          )}
          {/* Résumé visible seulement quand replié ET monté (évite le flash SSR) */}
          {mounted && !open && summary && (
            <span style={{
              fontSize: 11, color: C_MUTED,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              paddingLeft: 4,
            }}>
              · {summary}
            </span>
          )}
        </div>

        {/* Droite : action (si ouvert) + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {open && action}
          <svg
            width="15" height="15" viewBox="0 0 15 15" fill="none"
            style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : 'none' }}
          >
            <path d="M3 5.5L7.5 10L12 5.5" stroke={C_MUTED} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Contenu (visible si ouvert) ── */}
      {open && (
        <div style={{ padding: 20 }}>
          {children}
        </div>
      )}
    </div>
  )
}
