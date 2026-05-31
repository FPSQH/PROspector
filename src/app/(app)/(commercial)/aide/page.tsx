'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useOnboarding, STEPS } from '@/contexts/OnboardingContext'

const MODULES = [
  {
    href: '/dashboard',
    emoji: '📊',
    label: 'Dashboard',
    desc: "Vue d'ensemble de toute ton activité : portes frappées, taux de contact, contacts qualifiés, courriers envoyés. Un indicateur de performance en temps réel pour piloter ta prospection.",
  },
  {
    href: '/onboarding',
    emoji: '🗺️',
    label: 'Secteur',
    desc: "Définis ton territoire de prospection en ajoutant tes communes cibles. PROspector charge automatiquement l'intégralité des adresses et données DPE pour que tu sois opérationnel en quelques minutes.",
  },
  {
    href: '/zones',
    emoji: '📍',
    label: 'Zones',
    desc: "Organise ton secteur en zones géographiques précises sur une carte interactive. Suis l'avancement de chaque zone : maisons non visitées, contactées, qualifiées. Optimise tes tournées zone par zone.",
  },
  {
    href: '/courriers',
    emoji: '✉️',
    label: 'Courrier DPE',
    desc: "Génère des courriers de prospection ciblés vers les propriétaires de logements énergivores (DPE E, F, G). Personnalise tes modèles avec les infos de ton agence et envoie en masse.",
  },
  {
    href: '/terrain',
    emoji: '🏘️',
    label: 'Terrain',
    desc: "La carte de terrain interactive pour tes sorties prospection. Visualise chaque bien avec son DPE, marque les portes frappées, enregistre les contacts rencontrés directement depuis ton téléphone.",
  },
  {
    href: '/planning',
    emoji: '📅',
    label: 'Planning',
    desc: "Calendrier de tes tournées et rendez-vous. Programme tes sorties terrain à l'avance, retrouve ton planning hebdomadaire et mensuel, ne laisse plus aucun RDV te passer sous le nez.",
  },
  {
    href: '/contacts',
    emoji: '👥',
    label: 'Contacts',
    desc: "Tous les contacts générés lors de tes sorties terrain sont centralisés ici. Qualifie chaque prospect (chaud, tiède, froid), ajoute des notes, filtre par statut et suis leur parcours vers la signature.",
  },
  {
    href: '/historique',
    emoji: '🕐',
    label: 'Historique',
    desc: "Récapitulatif complet de toutes tes actions : portes visitées par date, contacts enregistrés, courriers envoyés, zones couvertes. Analyse ta progression et identifie tes meilleures périodes.",
  },
]

export default function AidePage() {
  const { startGuide } = useOnboarding()

  // Démarrage automatique si ?welcome=true (premier login)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('welcome') === 'true') {
      startGuide()
      const url = new URL(window.location.href)
      url.searchParams.delete('welcome')
      window.history.replaceState({}, '', url.toString())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      minHeight: '100%', background: '#0F0F11', color: '#F0F0F2',
      padding: 'clamp(20px, 4vw, 40px)',
      paddingBottom: 'calc(clamp(20px, 4vw, 40px) + env(safe-area-inset-bottom, 0px) + 80px)',
    }}>

      {/* ── Header ── */}
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(217,119,6,0.2), rgba(217,119,6,0.08))',
            border: '1px solid rgba(217,119,6,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>
            ❓
          </div>
          <div>
            <h1 style={{ fontSize: 'clamp(20px,4vw,28px)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              Centre d&apos;aide
            </h1>
            <p style={{ fontSize: 14, color: '#6B6B7B', margin: '4px 0 0' }}>
              Tout ce dont tu as besoin pour bien démarrer
            </p>
          </div>
        </div>

        {/* ── CTA Relancer guide ── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(217,119,6,0.12), rgba(245,158,11,0.06))',
          border: '1px solid rgba(217,119,6,0.25)',
          borderRadius: 16, padding: '20px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
          marginTop: 24, marginBottom: 36,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              🚀 Guide de première connexion
            </div>
            <div style={{ fontSize: 13, color: '#9E9EAD', lineHeight: 1.5 }}>
              Parcours interactif en 8 étapes pour découvrir toutes les fonctionnalités
            </div>
          </div>
          <button
            onClick={startGuide}
            style={{
              padding: '12px 22px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #D97706, #F59E0B)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              boxShadow: '0 4px 16px rgba(217,119,6,0.35)',
              flexShrink: 0,
            }}
          >
            ▶ Relancer le guide
          </button>
        </div>

        {/* ── Guide de démarrage ── */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: '#F0F0F2' }}>
            Guide de démarrage
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STEPS.map((step, i) => (
              <Link key={step.href} href={step.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: '14px 16px',
                  transition: 'background 0.15s, border-color 0.15s',
                  cursor: 'pointer',
                }}>
                  {/* Numéro */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(217,119,6,0.12)',
                    border: '1px solid rgba(217,119,6,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: '#D97706',
                  }}>
                    {i + 1}
                  </div>
                  {/* Emoji */}
                  <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{step.emoji}</span>
                  {/* Texte */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#F0F0F2', marginBottom: 3 }}>
                      {step.title}
                    </div>
                    <div style={{ fontSize: 13, color: '#6B6B7B', lineHeight: 1.5 }}>
                      {step.description}
                    </div>
                  </div>
                  {/* Flèche */}
                  <span style={{ color: '#4A4A58', fontSize: 16, flexShrink: 0, marginTop: 4 }}>›</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Comprendre les modules ── */}
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: '#F0F0F2' }}>
            Comprendre les modules
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
            gap: 12,
          }}>
            {MODULES.map((mod) => (
              <Link key={mod.href} href={mod.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14, padding: '18px 18px',
                  height: '100%', boxSizing: 'border-box',
                  transition: 'background 0.15s, border-color 0.15s',
                  cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 22 }}>{mod.emoji}</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#F0F0F2' }}>{mod.label}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#6B6B7B', lineHeight: 1.6, margin: 0 }}>
                    {mod.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Footer tip ── */}
        <div style={{
          marginTop: 36, padding: '16px 18px',
          background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.15)',
          borderRadius: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💬</span>
          <p style={{ fontSize: 13, color: 'rgba(29,158,117,0.8)', margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: '#1D9E75' }}>Un problème ?</strong>{' '}
            Contacte ton responsable ou consulte la documentation transmise lors de ton onboarding.
            Tu peux aussi relancer le guide interactif à tout moment depuis cette page.
          </p>
        </div>
      </div>
    </div>
  )
}
