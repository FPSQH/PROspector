'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface Tab {
  href: string
  label: string
  icon: (active: boolean) => React.ReactNode
  center?: boolean
}

const tabs: Tab[] = [
  {
    href: '/dashboard',
    label: 'Accueil',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9,22 9,12 15,12 15,22"/>
      </svg>
    ),
  },
  {
    href: '/zones',
    label: 'Zones',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/>
        <line x1="9" y1="3" x2="9" y2="18"/>
        <line x1="15" y1="6" x2="15" y2="21"/>
      </svg>
    ),
  },
  {
    href: '/courriers',
    label: 'Courriers',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
    ),
  },
  {
    href: '/terrain',
    label: 'Terrain',
    center: true,
    icon: (_active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="10" r="3"/>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      </svg>
    ),
  },
  {
    href: '/contacts',
    label: 'Contacts',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },

  {
    href: '/planning',
    label: 'Planning',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
]

export default function BottomTabBar() {
  const pathname = usePathname()
  // Masquer sur terrain (navigation propre) et zones/edit (plein ecran)
  if (pathname.startsWith('/terrain') || pathname.startsWith('/zones/edit')) return null

  return (
    <>
      <div style={{ height: 'calc(68px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }} />
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 500,
          background: '#fff',
          borderTop: '1px solid #E8E6DF',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          display: 'flex',
          alignItems: 'stretch',
          height: 'calc(68px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')

          if (tab.center) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  textDecoration: 'none',
                  position: 'relative',
                  paddingBottom: 4,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: isActive ? '#0F6E56' : '#1D9E75',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(29,158,117,0.35)',
                    marginTop: -20,
                    border: '3px solid #fff',
                  }}
                >
                  {tab.icon(true)}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#1D9E75' : '#9ca3af', letterSpacing: '0.02em' }}>
                  {tab.label}
                </span>
              </Link>
            )
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                textDecoration: 'none',
                paddingBottom: 4,
                paddingTop: 8,
                position: 'relative',
              }}
            >
              {tab.icon(isActive)}
              <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, color: isActive ? '#1D9E75' : '#9ca3af', letterSpacing: '0.02em' }}>
                {tab.label}
              </span>
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    width: 32,
                    height: 2.5,
                    borderRadius: '0 0 3px 3px',
                    background: '#1D9E75',
                  }}
                />
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
