'use client'

interface Props {
  commercialNom: string
  commercialPrenom: string
}

export default function DelegationBanner({ commercialNom, commercialPrenom }: Props) {
  return (
    <div style={{
      position:       'fixed',
      top:            0,
      left:           0,
      right:          0,
      zIndex:         1000,
      background:     '#92400E',
      borderBottom:   '1px solid #D97706',
      padding:        '8px 20px',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L14 13H2L8 2Z" stroke="#FCD34D" strokeWidth="1.5" strokeLinejoin="round"/>
          <line x1="8" y1="7" x2="8" y2="10" stroke="#FCD34D" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="12" r="0.7" fill="#FCD34D"/>
        </svg>
        <span style={{ fontSize: '0.82rem', color: '#FCD34D', fontWeight: 600 }}>
          Mode délégation
        </span>
        <span style={{ fontSize: '0.82rem', color: '#FDE68A' }}>
          — Vous agissez en tant que <strong>{commercialPrenom} {commercialNom}</strong>
        </span>
      </div>
      <a
        href="/manager/delegation/exit"
        style={{
          fontSize:    '0.78rem',
          fontWeight:  600,
          color:       '#FCD34D',
          textDecoration: 'none',
          padding:     '4px 12px',
          borderRadius: 6,
          border:      '1px solid rgba(252,211,77,0.4)',
          background:  'rgba(252,211,77,0.1)',
          whiteSpace:  'nowrap',
        }}
      >
        Quitter la délégation ×
      </a>
    </div>
  )
}
