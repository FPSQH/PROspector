'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

interface NavItem {
  href:     string
  label:    string
  icon:     React.ReactNode
  match:    string[]
  disabled?: boolean
}

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}

function IconZones() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/>
      <line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  )
}


function IconCourrier() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  )
}

function IconTerrain() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function IconContacts() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  {
    href:  '/dashboard',
    label: 'Dashboard',
    icon:  <IconDashboard />,
    match: ['/dashboard'],
  },
  {
    href:  '/zones',
    label: 'Zones',
    icon:  <IconZones />,
    match: ['/zones'],
  },
  {
    href:  '/courriers',
    label: 'Courrier DPE',
    icon:  <IconCourrier />,
    match: ['/courriers'],
  },
  {
    href:  '/terrain',
    label: 'Terrain',
    icon:  <IconTerrain />,
    match: ['/terrain'],
  },
  {
    href:  '/contacts',
    label: 'Contacts',
    icon:  <IconContacts />,
    match: ['/contacts'],
  },
  {
    href:  '/planning',
    label: 'Planning',
    icon:  <IconCalendar />,
    match: ['/planning'],
  },
]

interface Props {
  children:    React.ReactNode
  userName?:   string
  userInitials?: string
}

export default function AppShell({ children, userName, userInitials }: Props) {
  const pathname  = usePathname()
  const [expanded, setExpanded] = useState(false)

  // Pages sans sidebar (plein écran)
  const fullscreen = ['/zones/edit'].some((p) => pathname.startsWith(p))
  const terrainActif = pathname.startsWith('/terrain')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (fullscreen) return <>{children}</>

  const isActive = (item: NavItem) =>
    item.match.some((m) => pathname === m || pathname.startsWith(m + '/'))

  const sidebarW = expanded ? 200 : 56

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#f8f7f4', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        style={{
          width:          sidebarW,
          minWidth:       sidebarW,
          background:     '#fff',
          borderRight:    '1px solid #e8e7e0',
          display:        'flex',
          flexDirection:  'column',
          overflow:       'hidden',
          transition:     'width 0.18s ease, min-width 0.18s ease',
          zIndex:         100,
          flexShrink:     0,
        }}
      >
        {/* Logo */}
        <div style={{
          height:       56,
          display:      'flex',
          alignItems:   'center',
          padding:      '0 16px',
          borderBottom: '1px solid #f0efeb',
          gap:          10,
          overflow:     'hidden',
          flexShrink:   0,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: '#1D9E75', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/>
              <path d="M12 22V12M2 7l10 5 10-5"/>
            </svg>
          </div>
          {expanded && (
            <span style={{
              fontWeight: 700, fontSize: '0.9rem', color: '#1a1a18',
              whiteSpace: 'nowrap', opacity: expanded ? 1 : 0,
              transition: 'opacity 0.1s',
            }}>
              PROspector
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <div key={item.href} style={{ padding: '2px 8px' }}>
                {item.disabled ? (
                  <div style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         10,
                    padding:     '9px 8px',
                    borderRadius: 8,
                    color:       '#c9c8c2',
                    cursor:      'not-allowed',
                    whiteSpace:  'nowrap',
                    overflow:    'hidden',
                    position:    'relative',
                  }}>
                    <span style={{ flexShrink: 0 }}>{item.icon}</span>
                    {expanded && (
                      <>
                        <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{item.label}</span>
                        <span style={{
                          marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 600,
                          background: '#f0efeb', color: '#9b9b96',
                          padding: '1px 5px', borderRadius: 3,
                        }}>bientôt</span>
                      </>
                    )}
                  </div>
                ) : (
                  <Link href={item.href} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display:      'flex',
                      alignItems:   'center',
                      gap:          10,
                      padding:      '9px 8px',
                      borderRadius: 8,
                      background:   active ? '#f0fdf4' : 'transparent',
                      color:        active ? '#0F6E56' : '#5F5E5A',
                      fontWeight:   active ? 600 : 400,
                      cursor:       'pointer',
                      whiteSpace:   'nowrap',
                      overflow:     'hidden',
                      transition:   'background 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = '#f8f7f4'
                    }}
                    onMouseLeave={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                    >
                      <span style={{ flexShrink: 0, color: active ? '#1D9E75' : 'currentColor' }}>
                        {item.icon}
                      </span>
                      {expanded && (
                        <span style={{ fontSize: '0.82rem' }}>{item.label}</span>
                      )}
                    </div>
                  </Link>
                )}
              </div>
            )
          })}
        </nav>

        {/* Bas : settings + avatar */}
        <div style={{ borderTop: '1px solid #f0efeb', padding: '8px', flexShrink: 0 }}>
          <div style={{ padding: '2px 0', marginBottom: 4 }}>
            <Link href="/settings" style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 8px', borderRadius: 8,
                color: pathname === '/settings' ? '#0F6E56' : '#9b9b96',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                <span style={{ flexShrink: 0 }}><IconSettings /></span>
                {expanded && <span style={{ fontSize: '0.82rem' }}>Paramètres</span>}
              </div>
            </Link>
          </div>

          {/* Avatar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 8px', overflow: 'hidden',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#E1F5EE', color: '#0F6E56',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
            }}>
              {userInitials ?? 'FP'}
            </div>
            {expanded && (
              <span style={{
                fontSize: '0.78rem', color: '#5F5E5A',
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

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav className="mobile-tab-bar">
        {NAV_ITEMS.filter(item => ['/dashboard','/zones','/terrain','/contacts','/planning'].includes(item.href)).map(item => {
          const active = isActive(item)
          return (
            <a key={item.href} href={item.href}
              className={'mobile-tab-item' + (active ? ' mobile-tab-active' : '')}
            >
              <span className="mobile-tab-icon">{item.icon}</span>
              <span className="mobile-tab-label">{item.label}</span>
            </a>
          )
        })}
      </nav>

    </div>
  )
}
