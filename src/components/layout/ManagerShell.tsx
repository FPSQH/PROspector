'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

interface NavItem {
  href:  string
  label: string
  icon:  (color: string) => React.ReactNode
  match: string[]
}

// ── Design tokens (identiques à AppShell) ─────────────────────
const GOLD     = '#D97706'
const GOLD_BG  = 'rgba(217,119,6,0.12)'
const GOLD_BDR = 'rgba(217,119,6,0.2)'
const SIDE_BG  = '#0F0F11'
const BORDER   = 'rgba(255,255,255,0.06)'
const DIM      = '#4A4A58'
const MUTED    = '#6B6B7B'
const TEXT     = '#F0F0F2'
const TEAL     = '#1D9E75'
const TEAL_BG  = 'rgba(29,158,117,0.12)'
const TEAL_BDR = 'rgba(29,158,117,0.2)'

// ── Icons ──────────────────────────────────────────────────────
const Icon = {
  dashboard: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
    </svg>
  ),
  equipe: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="7" cy="6" r="2.5" stroke={c} strokeWidth="1.5"/>
      <path d="M2 15C2 12.24 4.24 10 7 10C9.76 10 12 12.24 12 15" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="13" cy="5.5" r="2" stroke={c} strokeWidth="1.3"/>
      <path d="M12.5 9.5C13.5 9.18 14.5 9.5 15.5 10.5C16.1 11.1 16.3 12 16 13" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  carte: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <polygon points="2,4 7,2 11,4 16,2 16,14 11,16 7,14 2,16" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/>
      <line x1="7" y1="2" x2="7" y2="14" stroke={c} strokeWidth="1.4"/>
      <line x1="11" y1="4" x2="11" y2="16" stroke={c} strokeWidth="1.4"/>
    </svg>
  ),
  alertes: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L16 14H2L9 2Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="9" y1="8" x2="9" y2="11" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="13" r="0.8" fill={c}/>
    </svg>
  ),
  settings: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.5" stroke={c} strokeWidth="1.5"/>
      <path d="M9 2V4M9 14V16M2 9H4M14 9H16M4.22 4.22L5.64 5.64M12.36 12.36L13.78 13.78M13.78 4.22L12.36 5.64M5.64 12.36L4.22 13.78" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  aide: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke={c} strokeWidth="1.5"/>
      <path d="M7 7.2C7 6.09 7.9 5.2 9 5.2C10.1 5.2 11 6.09 11 7.2C11 8.31 9 9.2 9 9.2V10.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="13" r="0.9" fill={c}/>
    </svg>
  ),
}

const NAV_ITEMS: NavItem[] = [
  { href: '/manager/dashboard', label: 'Vue équipe',  icon: Icon.dashboard, match: ['/manager/dashboard'] },
  { href: '/manager/equipe',    label: 'Commerciaux', icon: Icon.equipe,    match: ['/manager/equipe'] },
  { href: '/manager/carte',     label: 'Carte équipe',icon: Icon.carte,     match: ['/manager/carte'] },
  { href: '/manager/alertes',   label: 'Alertes',     icon: Icon.alertes,   match: ['/manager/alertes'] },
]

interface Props {
  children:      React.ReactNode
  userName?:     string
  userInitials?: string
}

export default function ManagerShell({ children, userName, userInitials }: Props) {
  const pathname  = usePathname()
  const [expanded, setExpanded] = useState(false)

  const isActive = (item: NavItem) =>
    item.match.some((m) => pathname === m || pathname.startsWith(m + '/'))

  const sidebarW = expanded ? 180 : 56

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>

      {/* ── Sidebar Manager ─────────────────────────────────── */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        style={{
          width:         sidebarW,
          minWidth:      sidebarW,
          background:    SIDE_BG,
          borderRight:   `1px solid ${BORDER}`,
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          transition:    'width 0.18s ease, min-width 0.18s ease',
          zIndex:        200,
          flexShrink:    0,
        }}
      >
        {/* Logo + badge Manager */}
        <div style={{
          height:       56,
          display:      'flex',
          alignItems:   'center',
          padding:      '0 11px',
          borderBottom: `1px solid ${BORDER}`,
          gap:          10,
          overflow:     'hidden',
          flexShrink:   0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${GOLD}, #F59E0B)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 12px rgba(217,119,6,0.35)`,
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>P</span>
          </div>
          {expanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: TEXT, whiteSpace: 'nowrap' }}>
                PROspector
              </span>
              <span style={{
                fontSize: '0.62rem', fontWeight: 600, color: TEAL,
                background: TEAL_BG, border: `1px solid ${TEAL_BDR}`,
                borderRadius: 4, padding: '0 5px', lineHeight: '16px',
                whiteSpace: 'nowrap', width: 'fit-content',
              }}>
                MANAGER
              </span>
            </div>
          )}
        </div>

        {/* Nav principale */}
        <nav style={{ flex: 1, padding: '10px 9px', overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <div key={item.href} style={{ marginBottom: 2, position: 'relative' }}>
                {active && (
                  <div style={{
                    position: 'absolute', left: -9, top: '50%', transform: 'translateY(-50%)',
                    width: 3, height: 18, borderRadius: '0 2px 2px 0',
                    background: TEAL,
                  }} />
                )}
                <Link href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 9px', borderRadius: 8,
                    background: active ? TEAL_BG : 'transparent',
                    border:     active ? `1px solid ${TEAL_BDR}` : '1px solid transparent',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    transition: 'background 0.12s, border-color 0.12s',
                  }}>
                    <span style={{ flexShrink: 0 }}>{item.icon(active ? TEAL : DIM)}</span>
                    {expanded && (
                      <span style={{
                        fontSize: '0.82rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? TEXT : MUTED,
                      }}>
                        {item.label}
                      </span>
                    )}
                  </div>
                </Link>
              </div>
            )
          })}
        </nav>

        {/* Bottom — Aide + Paramètres + Avatar */}
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '8px 9px', flexShrink: 0 }}>

          {/* Aide */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            {pathname === '/aide' && (
              <div style={{
                position: 'absolute', left: -9, top: '50%', transform: 'translateY(-50%)',
                width: 3, height: 18, borderRadius: '0 2px 2px 0', background: TEAL,
              }} />
            )}
            <Link href="/aide" style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 9px', borderRadius: 8,
                background: pathname === '/aide' ? TEAL_BG : 'transparent',
                border: pathname === '/aide' ? `1px solid ${TEAL_BDR}` : '1px solid transparent',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                <span style={{ flexShrink: 0 }}>{Icon.aide(pathname === '/aide' ? TEAL : DIM)}</span>
                {expanded && (
                  <span style={{ fontSize: '0.82rem', fontWeight: pathname === '/aide' ? 600 : 400, color: pathname === '/aide' ? TEXT : MUTED }}>Aide</span>
                )}
              </div>
            </Link>
          </div>

          {/* Paramètres */}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            {pathname === '/settings' && (
              <div style={{
                position: 'absolute', left: -9, top: '50%', transform: 'translateY(-50%)',
                width: 3, height: 18, borderRadius: '0 2px 2px 0', background: TEAL,
              }} />
            )}
            <Link href="/settings" style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 9px', borderRadius: 8,
                background: pathname === '/settings' ? TEAL_BG : 'transparent',
                border: pathname === '/settings' ? `1px solid ${TEAL_BDR}` : '1px solid transparent',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                <span style={{ flexShrink: 0 }}>{Icon.settings(pathname === '/settings' ? TEAL : DIM)}</span>
                {expanded && (
                  <span style={{ fontSize: '0.82rem', fontWeight: pathname === '/settings' ? 600 : 400, color: pathname === '/settings' ? TEXT : MUTED }}>Paramètres</span>
                )}
              </div>
            </Link>
          </div>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 9px', overflow: 'hidden' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: TEAL_BG,
              border: `1.5px solid ${TEAL_BDR}`,
              color: TEAL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.68rem', fontWeight: 700,
            }}>
              {userInitials ?? 'M'}
            </div>
            {expanded && (
              <span style={{
                fontSize: '0.78rem', color: MUTED,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {userName ?? 'Manager'}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* ── Contenu principal ── */}
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {children}
      </main>

    </div>
  )
}
