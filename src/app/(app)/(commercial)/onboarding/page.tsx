'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { SearchCommune } from '@/components/onboarding/SearchCommune'
import { CommuneCard } from '@/components/onboarding/CommuneCard'
import { SecteurMap } from '@/components/map/SecteurMap'
import { useCommercial } from '@/hooks/useCommercial'
import { useCommunes } from '@/hooks/useCommunes'

function OnboardingContent() {
  const router = useRouter()
  const { commercial } = useCommercial()
  const { communes, refresh } = useCommunes(commercial?.id)
  const [adding, setAdding] = useState(false)

  const communesInsee = communes.map(c => c.code_insee)
  const toutesChargees = communes.length > 0 && communes.every(c => !!c.chargee_at)

  async function handleAddCommune(c: { code_insee: string; nom: string; code_postal: string; departement: string }) {
    setAdding(true)
    await fetch('/api/communes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    })
    await refresh()
    setAdding(false)
  }

  function handleRemove() { refresh() }

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f7f4', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: '#fff', borderBottom: '1px solid #e8e7e0',
        padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: '#1D9E75',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/>
            <path d="M12 22V12M2 7l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#1a1a18' }}>PROspector</div>
          <div style={{ fontSize: '0.8rem', color: '#9b9b96' }}>Configuration de votre secteur</div>
        </div>
      </div>

      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: 'minmax(0, 420px) 1fr',
        maxWidth: 1280, margin: '0 auto', width: '100%',
        padding: 24, gap: 24,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a1a18', marginBottom: 4 }}>
              Bonjour {commercial?.prenom ?? ''} 👋
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#5F5E5A', lineHeight: 1.6 }}>
              Commencez par définir les communes de votre secteur.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 6 }}>
              Ajouter une commune
            </label>
            <SearchCommune onSelect={handleAddCommune} communesActives={communesInsee} />
          </div>

          {communes.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#5F5E5A', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Communes du secteur ({communes.length})</span>
                {toutesChargees && (
                  <span style={{ color: '#1D9E75' }}>✓ Tout chargé</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {communes.map(c => (
                  <CommuneCard key={c.id} commune={c} onRemove={handleRemove} />
                ))}
              </div>
            </div>
          )}

          {communes.length > 0 && (
            <button
              onClick={() => router.push('/dashboard')}
              style={{
                marginTop: 'auto', padding: '14px 20px',
                background: toutesChargees ? '#1D9E75' : '#9FE1CB',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: '0.9375rem', fontWeight: 500,
                cursor: toutesChargees ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {toutesChargees ? 'Continuer vers le tableau de bord →' : 'Chargement en cours…'}
            </button>
          )}

          <p style={{ fontSize: '0.75rem', color: '#B4B2A9', lineHeight: 1.5 }}>
            Les adresses sont issues de la Base Adresse Nationale (données publiques).
          </p>
        </div>

        <div style={{ borderRadius: 12, overflow: 'hidden', minHeight: 500, border: '1.5px solid #e8e7e0' }}>
          <SecteurMap communesInsee={communesInsee} height="100%" />
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4' }}>
        <div style={{ color: '#9b9b96', fontSize: '0.875rem' }}>Chargement…</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
