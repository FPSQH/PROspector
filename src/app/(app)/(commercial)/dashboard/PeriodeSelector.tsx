'use client'

import { useRouter, usePathname } from 'next/navigation'

const OPTIONS = [
  { value: 'mois',  label: 'Ce mois' },
  { value: 'annee', label: 'Cette année' },
  { value: 'tout',  label: 'Depuis toujours' },
]

const GOLD = '#D97706'

export default function PeriodeSelector({ current }: { current: string }) {
  const router   = useRouter()
  const pathname = usePathname()

  return (
    <div style={{
      display: 'flex', gap: 2,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, padding: 3,
    }}>
      {OPTIONS.map(opt => {
        const active = current === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => router.push(`${pathname}?periode=${opt.value}`)}
            style={{
              padding: '4px 10px', borderRadius: 6,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: active ? GOLD : 'transparent',
              color: active ? '#fff' : '#6B6B7B',
              transition: 'all 0.12s',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
