'use client'

import { createContext, useContext, useState, useCallback } from 'react'

export interface OnboardingStep {
  href: string
  label: string
  title: string
  description: string
  emoji: string
  tip: string
}

export const STEPS: OnboardingStep[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    emoji: '📊',
    title: 'Bienvenue sur ton Dashboard',
    description: "C'est ta page d'accueil. Retrouve tes statistiques clés : portes frappées, contacts qualifiés, taux de conversion et évolution de ton activité en temps réel.",
    tip: "Configure d'abord ton secteur pour alimenter ces stats !",
  },
  {
    href: '/onboarding',
    label: 'Secteur',
    emoji: '🗺️',
    title: 'Configure ton secteur',
    description: "Ajoute les communes que tu prospectes. PROspector va charger toutes les adresses et données DPE de ton territoire pour préparer tes sorties terrain.",
    tip: "C'est la première étape indispensable — sans secteur configuré, pas de données !",
  },
  {
    href: '/zones',
    label: 'Zones',
    emoji: '📍',
    title: 'Crée tes zones de prospection',
    description: "Découpe ton secteur en zones précises sur la carte. Chaque zone te permet de suivre ta progression et de t'organiser par secteur lors de tes tournées.",
    tip: "Plus tes zones sont précises, plus ton suivi sera efficace.",
  },
  {
    href: '/courriers',
    label: 'Courrier DPE',
    emoji: '✉️',
    title: 'Prépare tes courriers DPE',
    description: "Génère des courriers personnalisés à destination des propriétaires avec un logement énergivore. Configure ton agence et choisis tes modèles de lettres.",
    tip: "Renseigne les infos de ton agence dans Paramètres avant de générer tes courriers.",
  },
  {
    href: '/terrain',
    label: 'Terrain',
    emoji: '🏘️',
    title: 'Pars en terrain !',
    description: "Lance la carte interactive lors de tes tournées. Visualise chaque bien, marque les portes frappées, filtre par DPE et note tes contacts directement.",
    tip: "Utilise PROspector depuis ton mobile pour noter chaque contact sur le vif !",
  },
  {
    href: '/planning',
    label: 'Planning',
    emoji: '📅',
    title: 'Organise ton planning',
    description: "Programme tes tournées à l'avance, fixe des rendez-vous et retrouve ton calendrier d'activité pour optimiser tes journées de prospection.",
    tip: "Un planning bien rempli, c'est une prospection bien plus efficace !",
  },
  {
    href: '/contacts',
    label: 'Contacts',
    emoji: '👥',
    title: 'Gère et qualifie tes contacts',
    description: "Tous les contacts générés lors de tes sorties terrain arrivent ici. Qualifie-les, ajoute des notes et suis leur évolution vers la signature.",
    tip: "La qualification régulière de tes contacts est la clé de ta conversion !",
  },
  {
    href: '/historique',
    label: 'Historique',
    emoji: '🕐',
    title: 'Consulte ton historique',
    description: "Reviens sur toutes tes actions passées : portes visitées, contacts pris, courriers envoyés. Un récap complet de ton activité pour mesurer ta progression.",
    tip: "Analyse ton historique régulièrement pour ajuster ta stratégie de prospection.",
  },
]

interface OnboardingCtx {
  activeStep: number | null
  isActive: boolean
  startGuide: () => void
  nextStep: () => void
  prevStep: () => void
  closeGuide: () => void
  totalSteps: number
}

const Ctx = createContext<OnboardingCtx | null>(null)

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [activeStep, setActiveStep] = useState<number | null>(null)

  const startGuide = useCallback(() => setActiveStep(0), [])
  const closeGuide = useCallback(() => setActiveStep(null), [])
  const nextStep   = useCallback(() => setActiveStep(s => s !== null && s < STEPS.length - 1 ? s + 1 : s), [])
  const prevStep   = useCallback(() => setActiveStep(s => s !== null && s > 0 ? s - 1 : s), [])

  return (
    <Ctx.Provider value={{
      activeStep,
      isActive: activeStep !== null,
      startGuide,
      nextStep,
      prevStep,
      closeGuide,
      totalSteps: STEPS.length,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useOnboarding() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider')
  return ctx
}
