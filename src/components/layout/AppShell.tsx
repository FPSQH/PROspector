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

// ── Design tokens sidebar ──────────────────────────────────────
const GOLD     = '#D97706'
const GOLD_BG  = 'rgba(217,119,6,0.12)'
const GOLD_BDR = 'rgba(217,119,6,0.2)'
const SIDE_BG  = '#0F0F11'
const BORDER   = 'rgba(255,255,255,0.06)'
const DIM      = '#4A4A58'
const MUTED    = '#6B6B7B'
const TEXT     = '#F0F0F2'

// ── Icons 18×18 ────────────────────────────────────────────────
const NavIcon = {
  dashboard: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke={c} strokeWidth="1.5"/>
    </svg>
  ),
  secteur: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <polygon points="2,5 8,2 14,5 16,4 16,14 14,13 8,16 2,13" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/>
      <line x1="8" y1="2" x2="8" y2="16" stroke={c} strokeWidth="1.4"/>
      <line x1="14" y1="5" x2="14" y2="13" stroke={c} strokeWidth="1.4"/>
    </svg>
  ),
  zones: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="6.5" stroke={c} strokeWidth="1.5"/>
      <circle cx="9" cy="9" r="2.5" stroke={c} strokeWidth="1.5"/>
      <line x1="9" y1="2" x2="9" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="13" x2="9" y2="16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  mail: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="4" width="14" height="10" rx="2" stroke={c} strokeWidth="1.5"/>
      <path d="M2 6L9 10.5L16 6" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  terrain: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2C6.79 2 5 3.79 5 6C5 9.5 9 14 9 14C9 14 13 9.5 13 6C13 3.79 11.21 2 9 2Z" stroke={c} strokeWidth="1.5"/>
      <circle cx="9" cy="6" r="1.5" stroke={c} strokeWidth="1.3"/>
    </svg>
  ),
  contacts: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6.5" r="3" stroke={c} strokeWidth="1.5"/>
      <path d="M3.5 15.5C3.5 12.46 5.96 10 9 10C12.04 10 14.5 12.46 14.5 15.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  calendar: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" stroke={c} strokeWidth="1.5"/>
      <line x1="2.5" y1="7.5" x2="15.5" y2="7.5" stroke={c} strokeWidth="1.5"/>
      <line x1="6" y1="2" x2="6" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="2" x2="12" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  settings: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.5" stroke={c} strokeWidth="1.5"/>
      <path d="M9 2V4M9 14V16M2 9H4M14 9H16M4.22 4.22L5.64 5.64M12.36 12.36L13.78 13.78M13.78 4.22L12.36 5.64M5.64 12.36L4.22 13.78" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard',    icon: NavIcon.dashboard, match: ['/dashboard'] },
  { href: '/onboarding', label: 'Secteur',     icon: NavIcon.secteur,   match: ['/onboarding'] },
  { href: '/zones',      label: 'Zones',       icon: NavIcon.zones,     match: ['/zones'] },
  { href: '/courriers',  label: 'Courrier DPE',icon: NavIcon.mail,      match: ['/courriers'] },
  { href: '/terrain',    label: 'Terrain',     icon: NavIcon.terrain,   match: ['/terrain'] },
  { href: '/contacts',   label: 'Contacts',    icon: NavIcon.contacts,  match: ['/contacts'] },
  { href: '/planning',   label: 'Planning',    icon: NavIcon.calendar,  match: ['/planning'] },
]

interface Props {
  children:      React.ReactNode
  userName?:     string
  userInitials?: string
}

export default function AppShell({ children, userName, userInitials }: Props) {
  const pathname  = usePathname()
  const [expanded, setExpanded] = useState(false)

  const fullscreen = ['/zones/edit'].some((p) => pathname.startsWith(p))
  if (fullscreen) return <>{children}</>

  const isActive = (item: NavItem) =>
    item.match.some((m) => pathname === m || pathname.startsWith(m + '/'))

  const sidebarW = expanded ? 180 : 56

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
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
          zIndex:        100,
          flexShrink:    0,
        }}
      >
        {/* Logo */}
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
            <span style={{
              fontWeight: 700, fontSize: '0.875rem', color: TEXT,
              whiteSpace: 'nowrap',
            }}>
              PROspector
            </span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 9px', overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <div key={item.href} style={{ marginBottom: 2, position: 'relative' }}>
                {/* Active indicator bar */}
                {active && (
                  <div style={{
                    position: 'absolute', left: -9, top: '50%', transform: 'translateY(-50%)',
                    width: 3, height: 18, borderRadius: '0 2px 2px 0',
                    background: GOLD,
                  }} />
                )}
                <Link href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 9px', borderRadius: 8,
                    background: active ? GOLD_BG : 'transparent',
                    border:     active ? `1px solid ${GOLD_BDR}` : '1px solid transparent',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    transition: 'background 0.12s, border-color 0.12s',
                  }}>
                    <span style={{ flexShrink: 0 }}>{item.icon(active ? GOLD : DIM)}</span>
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

        {/* Bottom */}
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '8px 9px', flexShrink: 0 }}>
          <div style={{ position: 'relative', marginBottom: 4 }}>
            {pathname === '/settings' && (
              <div style={{
                position: 'absolute', left: -9, top: '50%', transform: 'translateY(-50%)',
                width: 3, height: 18, borderRadius: '0 2px 2px 0', background: GOLD,
              }} />
            )}
            <Link href="/settings" style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 9px', borderRadius: 8,
                background: pathname === '/settings' ? GOLD_BG : 'transparent',
                border: pathname === '/settings' ? `1px solid ${GOLD_BDR}` : '1px solid transparent',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                <span style={{ flexShrink: 0 }}>{NavIcon.settings(pathname === '/settings' ? GOLD : DIM)}</span>
                {expanded && (
                  <span style={{
                    fontSize: '0.82rem',
                    fontWeight: pathname === '/settings' ? 600 : 400,
                    color: pathname === '/settings' ? TEXT : MUTED,
                  }}>Paramètres</span>
                )}
              </div>
            </Link>
          </div>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 9px', overflow: 'hidden' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(217,119,6,0.15)',
              border: '1.5px solid rgba(217,119,6,0.3)',
              color: GOLD,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.68rem', fontWeight: 700,
            }}>
              {userInitials ?? 'FP'}
            </div>
            {expanded && (
              <span style={{
                fontSize: '0.78rem', color: MUTED,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {userName ?? 'Commercial'}
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
