'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useOnboarding, STEPS } from '@/contexts/OnboardingContext'

interface Tab {
  href: string
  label: string
  icon: (active: boolean, spotlight: boolean) => React.ReactNode
  center?: boolean
}

const tabs: Tab[] = [
  {
    href: '/dashboard',
    label: 'Accueil',
    icon: (active, spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active || spotlight ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9,22 9,12 15,12 15,22"/>
      </svg>
    ),
  },
  {
    href: '/onboarding',
    label: 'Secteur',
    icon: (active, spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active || spotlight ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3,7 9,4 15,7 21,4 21,17 15,20 9,17 3,20"/>
        <line x1="9" y1="4" x2="9" y2="17"/>
        <line x1="15" y1="7" x2="15" y2="20"/>
      </svg>
    ),
  },
  {
    href: '/zones',
    label: 'Zones',
    icon: (active, spotlight) => {
      const c = active || spotlight ? '#1D9E75' : '#9ca3af'
      return (
        <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="6.5" stroke={c} strokeWidth="1.5"/>
          <circle cx="9" cy="9" r="2.5" stroke={c} strokeWidth="1.5"/>
          <line x1="9" y1="2" x2="9" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="9" y1="13" x2="9" y2="16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
  },
  {
    href: '/explorer',
    label: 'Explorer',
    icon: (active, spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active || spotlight ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    href: '/courriers',
    label: 'Courrier',
    icon: (active, spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active || spotlight ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
    ),
  },
  {
    href: '/terrain',
    label: 'Terrain',
    center: true,
    icon: (_active, _spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="10" r="3"/>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      </svg>
    ),
  },
  {
    href: '/contacts',
    label: 'Contacts',
    icon: (active, spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active || spotlight ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    icon: (active, spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active || spotlight ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: '/historique',
    label: 'Historique',
    icon: (active, spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active || spotlight ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <polyline points="12 7 12 12 15 15"/>
        <path d="M5.5 5L4 3.5M4 6.5H7"/>
      </svg>
    ),
  },
  {
    href: '/aide',
    label: 'Aide',
    icon: (active, spotlight) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active || spotlight ? '#1D9E75' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M9 9.5C9 8.12 10.12 7 11.5 7C12.88 7 14 8.12 14 9.5C14 10.88 12 12 12 12V13.5"/>
        <circle cx="12" cy="17" r="0.8" fill={active || spotlight ? '#1D9E75' : '#9ca3af'} stroke="none"/>
      </svg>
    ),
  },
]

export default function BottomTabBar() {
  const pathname = usePathname()
  const { activeStep, isActive } = useOnboarding()

  if (pathname.startsWith('/terrain') || pathname.startsWith('/zones/edit')) return null

  const spotlightHref = isActive && activeStep !== null ? STEPS[activeStep].href : null

  return (
    <>
      <style>{`
        @keyframes tab-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(29,158,117,0.7); }
          70%  { box-shadow: 0 0 0 8px rgba(29,158,117,0); }
          100% { box-shadow: 0 0 0 0 rgba(29,158,117,0); }
        }
      `}</style>
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
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          height: 'calc(68px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {tabs.map((tab) => {
          const isActiveTab = pathname === tab.href || pathname.startsWith(tab.href + '/')
          const spotlight   = spotlightHref === tab.href

          if (tab.center) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  flex: '0 0 64px',
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
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: isActiveTab ? '#0F6E56' : '#1D9E75',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: spotlight
                    ? '0 4px 16px rgba(29,158,117,0.5), 0 0 0 3px rgba(29,158,117,0.4)'
                    : '0 4px 16px rgba(29,158,117,0.35)',
                  marginTop: -20,
                  border: '3px solid #fff',
                  animation: spotlight ? 'tab-pulse 1.5s ease infinite' : 'none',
                }}>
                  {tab.icon(true, spotlight)}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: isActiveTab ? '#1D9E75' : '#9ca3af', letterSpacing: '0.02em' }}>
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
                flex: '0 0 64px',
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
              <div style={{
                borderRadius: 10, padding: '4px 6px',
                ...(spotlight ? {
                  background: 'rgba(29,158,117,0.08)',
                  animation: 'tab-pulse 1.5s ease infinite',
                } : {}),
              }}>
                {tab.icon(isActiveTab, spotlight)}
              </div>
              <span style={{ fontSize: 10, fontWeight: isActiveTab || spotlight ? 600 : 400, color: isActiveTab || spotlight ? '#1D9E75' : '#9ca3af', letterSpacing: '0.02em' }}>
                {tab.label}
              </span>
              {(isActiveTab) && (
                <div style={{
                  position: 'absolute', top: 0, width: 32, height: 2.5,
                  borderRadius: '0 0 3px 3px', background: '#1D9E75',
                }} />
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
