'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SearchCommune } from '@/components/onboarding/SearchCommune'
import { SecteurMap } from '@/components/map/SecteurMap'

interface Commune {
  id:          string
  code_insee:  string
  nom:         string
  code_postal: string
  departement: string
  chargee_at:  string | null
  nb_adresses?: number
}

interface CommuneResult {
  code_insee:  string
  nom:         string
  code_postal: string
  departement: string
  population:  number
}

export default function OnboardingPage() {
  const router = useRouter()
  const [communes, setCommunes]     = useState<Commune[]>([])
  const [loading, setLoading]       = useState(true)
  const [navigating, setNavigating] = useState(false)

  // Charger les communes actuelles
  const loadCommunes = useCallback(async () => {
    const res  = await fetch('/api/communes')
    const data = await res.json()
    setCommunes(data.communes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadCommunes() }, [loadCommunes])

  // Polling avec timeout automatique (90s max par commune)
  useEffect(() => {
    const enCours = communes.filter((c) => !c.chargee_at)
    if (enCours.length === 0) return

    let attempts = 0
    const MAX_ATTEMPTS = 22 // 22 × 4s = ~90 secondes

    const interval = setInterval(async () => {
      attempts++
      try {
        const res  = await fetch('/api/communes/statut')
        const data = await res.json()
        if (data.statuts) {
          setCommunes((prev) =>
            prev.map((c) => {
              const s = data.statuts.find((s: any) => s.code_insee === c.code_insee)
              if (!s) return c
              // Considérer comme chargée si chargee_at est défini OU si des adresses existent
              const effectivementChargee = !!s.chargee_at || s.nb_adresses > 0
              return {
                ...c,
                chargee_at: effectivementChargee ? (s.chargee_at ?? new Date().toISOString()) : c.chargee_at,
                nb_adresses: s.nb_adresses,
              }
            })
          )
        }
      } catch (e) {
        // Ignorer les erreurs réseau temporaires
      }

      // Timeout : après MAX_ATTEMPTS, forcer le statut "chargé" pour débloquer l'UI
      if (attempts >= MAX_ATTEMPTS) {
        setCommunes((prev) =>
          prev.map((c) => {
            if (c.chargee_at) return c
            return { ...c, chargee_at: new Date().toISOString() }
          })
        )
        clearInterval(interval)
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [communes])

  // Ajouter une ou plusieurs communes
  const handleAdd = async (results: CommuneResult[]) => {
    // Ajout séquentiel (fire & forget pour l'ingestion BAN)
    for (const commune of results) {
      await fetch('/api/communes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_insee:  commune.code_insee,
          nom:         commune.nom,
          code_postal: commune.code_postal,
          departement: commune.departement,
        }),
      })
    }
    await loadCommunes()
  }

  // Supprimer une commune
  const handleRemove = async (codeInsee: string) => {
    await fetch(`/api/communes/${codeInsee}`, { method: 'DELETE' })
    await loadCommunes()
  }

  const communesInsee       = communes.map((c) => c.code_insee)
  const toutesChargees      = communes.every((c) => !!c.chargee_at)
  const nbEnCours           = communes.filter((c) => !c.chargee_at).length
  const canGoToDashboard    = communes.length > 0 // accessible même si BAN pas fini

  const handleDashboard = () => {
    setNavigating(true)
    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f7f4' }}>

      {/* Header */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e8e7e0',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: '#1D9E75',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/>
              <path d="M12 22V12M2 7l10 5 10-5"/>
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>PROspector</span>
        </div>

        {canGoToDashboard && (
          <button
            onClick={handleDashboard}
            disabled={navigating}
            style={{
              padding: '7px 18px', borderRadius: 8,
              background: navigating ? '#9b9b96' : '#1D9E75',
              color: '#fff', border: 'none',
              fontSize: '0.875rem', fontWeight: 600,
              cursor: navigating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {navigating ? 'Chargement…' : 'Accéder au Dashboard →'}
          </button>
        )}
      </header>

      {/* Corps */}
      <main style={{
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
        gap: 0, height: 'calc(100dvh - 56px)',
      }}>

        {/* Colonne gauche */}
        <aside style={{
          borderRight: '1px solid #e8e7e0',
          background: '#fff',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f0efeb' }}>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1a1a18', margin: '0 0 4px' }}>
              Mon secteur
            </h1>
            <p style={{ fontSize: '0.8rem', color: '#9b9b96', margin: 0, lineHeight: 1.4 }}>
              Ajoutez les communes de votre zone de prospection.
            </p>
          </div>

          {/* Recherche */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0efeb' }}>
            <SearchCommune
              onAdd={handleAdd}
              communesExistantes={communesInsee}
            />
          </div>

          {/* Liste des communes */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 24, color: '#9b9b96', fontSize: '0.875rem' }}>Chargement…</div>
            ) : communes.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>🏘️</div>
                <p style={{ fontSize: '0.875rem', color: '#5F5E5A', lineHeight: 1.5 }}>
                  Aucune commune dans votre secteur.
                </p>
                <p style={{ fontSize: '0.8rem', color: '#9b9b96', lineHeight: 1.5 }}>
                  Recherchez par nom ou code postal.
                </p>
              </div>
            ) : (
              <>
                <div style={{ padding: '10px 24px 6px', fontSize: '0.75rem', color: '#9b9b96' }}>
                  {communes.length} commune{communes.length > 1 ? 's' : ''} dans le secteur
                  {nbEnCours > 0 && (
                    <span style={{ color: '#d97706', marginLeft: 6 }}>
                      · {nbEnCours} en chargement BAN…
                    </span>
                  )}
                </div>
                {communes.map((commune) => {
                  const chargee = !!commune.chargee_at
                  return (
                    <div key={commune.code_insee} style={{
                      padding: '12px 24px',
                      borderBottom: '1px solid #f8f7f4',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      {/* Indicateur statut */}
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: chargee ? '#22c55e' : '#f59e0b',
                        boxShadow: chargee
                          ? '0 0 0 3px rgba(34,197,94,0.15)'
                          : '0 0 0 3px rgba(245,158,11,0.15)',
                      }}/>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem', color: '#1a1a18' }}>
                          {commune.nom}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 2 }}>
                          {commune.code_postal} · Dép. {commune.departement}
                          {chargee && commune.nb_adresses != null && (
                            <> · <strong style={{ color: '#5F5E5A' }}>
                              {commune.nb_adresses.toLocaleString('fr-FR')} adresses
                            </strong></>
                          )}
                        </div>
                      </div>

                      {/* Badge BAN en cours */}
                      {!chargee && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: '0.72rem', color: '#d97706', fontWeight: 500,
                        }}>
                          <div style={{
                            width: 11, height: 11, borderRadius: '50%',
                            border: '2px solid #f59e0b', borderTopColor: 'transparent',
                            animation: 'spin 0.7s linear infinite',
                          }}/>
                          BAN…
                        </div>
                      )}

                      {/* Supprimer */}
                      <button
                        onClick={() => handleRemove(commune.code_insee)}
                        title="Retirer"
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          border: '1px solid #e8e7e0', background: 'transparent',
                          cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          color: '#9b9b96', flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'
                          ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#fecaca'
                          ;(e.currentTarget as HTMLButtonElement).style.color = '#ef4444'
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                          ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#e8e7e0'
                          ;(e.currentTarget as HTMLButtonElement).style.color = '#9b9b96'
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Footer : bouton Dashboard */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #f0efeb' }}>
            {communes.length === 0 ? (
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: '#f8f7f4', border: '1px solid #e8e7e0',
                fontSize: '0.8rem', color: '#9b9b96', textAlign: 'center',
              }}>
                Ajoutez au moins une commune pour continuer
              </div>
            ) : (
              <button
                onClick={handleDashboard}
                disabled={navigating}
                style={{
                  width: '100%', padding: '10px',
                  borderRadius: 9, border: 'none',
                  background: navigating ? '#9b9b96' : '#1D9E75',
                  color: '#fff', fontWeight: 600,
                  fontSize: '0.9rem', cursor: navigating ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                }}>
                {navigating
                  ? 'Chargement…'
                  : toutesChargees
                  ? 'Accéder au Dashboard →'
                  : `Dashboard (${nbEnCours} BAN en cours…)`}
              </button>
            )}
          </div>
        </aside>

        {/* Carte */}
        <div style={{ overflow: 'hidden' }}>
          <SecteurMap
            communesInsee={communesInsee}
            height="100%"
          />
        </div>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
