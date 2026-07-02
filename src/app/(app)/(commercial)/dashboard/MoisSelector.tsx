'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const GOLD = '#D97706'

export default function MoisSelector({ current }: { current: string }) {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  // current = 'YYYY-MM'
  const [year, month] = current.split('-').map(Number)

  function navigate(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    const newVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const params = new URLSearchParams(searchParams.toString())
    params.set('mois_display', newVal)
    router.push(`${pathname}?${params.toString()}`)
  }

  const label = new Date(year, month - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const labelFmt = label.charAt(0).toUpperCase() + label.slice(1)

  const now     = new Date()
  const isToday = year === now.getFullYear() && month === now.getMonth() + 1

  function goToday() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('mois_display')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 6, width: 26, height: 26, cursor: 'pointer',
          color: '#9A9AA8', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, lineHeight: 1,
        }}
        title="Mois précédent"
      >‹</button>

      <div style={{
        background: 'rgba(255,255,255,0.04)', border: `1px solid ${isToday ? GOLD+'44' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 6, padding: '3px 10px', minWidth: 130, textAlign: 'center',
        cursor: isToday ? 'default' : 'pointer',
        color: isToday ? GOLD : '#F0F0F2',
        fontSize: 12, fontWeight: 600,
      }}
        onClick={isToday ? undefined : goToday}
        title={isToday ? 'Mois en cours' : 'Revenir au mois en cours'}
      >
        {labelFmt}
      </div>

      <button
        onClick={() => navigate(+1)}
        disabled={isToday}
        style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 6, width: 26, height: 26, cursor: isToday ? 'not-allowed' : 'pointer',
          color: isToday ? '#4A4A58' : '#9A9AA8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, lineHeight: 1,
        }}
        title="Mois suivant"
      >›</button>
    </div>
  )
}
