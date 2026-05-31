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
    description: "Ajoute les communes que tu prospectes. PROspector charge toutes les adresses et données DPE de ton territoire, puis propose automatiquement un découpage en zones de prospection optimisées pour préparer tes sorties terrain.",
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
    description: "Génère des courriers personnalisés à destination des propriétaires selon leur DPE. Tous les profils sont intéressants : qu'il s'agisse d'un bien à valoriser ou à rénover, adapte ton message à chaque situation.",
    tip: "Renseigne les infos de ton agence dans Paramètres avant de générer tes courriers.",
  },
  {
    href: '/terrain',
    label: 'Terrain',
    emoji: '🏘️',
    title: 'Pars en terrain !',
    description: "Connecte-toi depuis ton smartphone pour te géolocaliser en temps réel sur ta zone. Visualise chaque bien, marque les portes frappées, filtre par DPE et enregistre tes contacts directement pendant ta prospection — sans perdre une seconde.",
    tip: "Ouvre PROspector sur ton mobile avant de partir : la géolocalisation te guide pas à pas dans ta zone !",
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
  {
    href: '/settings',
    label: 'Paramètres',
    emoji: '⚙️',
    title: 'Personnalise ton profil',
    description: "Renseigne tes informations personnelles et les coordonnées de ton agence : elles apparaîtront automatiquement sur tes courriers DPE. Tu peux aussi changer ton mot de passe à tout moment depuis cette page.",
    tip: "Commence par compléter ton profil agence — des courriers bien personnalisés, c'est une image pro dès le premier envoi !",
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
