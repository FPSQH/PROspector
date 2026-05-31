'use client'

import { useState, useRef } from 'react'
import { useOnboarding, STEPS } from '@/contexts/OnboardingContext'

function launchFireworks() {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998'
  document.body.appendChild(canvas)
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight

  const ctx2d = canvas.getContext('2d')!
  type P = { x: number; y: number; vx: number; vy: number; color: string; alpha: number; size: number }
  const particles: P[] = []
  const colors = ['#D97706','#F59E0B','#10B981','#3B82F6','#EC4899','#8B5CF6','#EF4444','#06B6D4','#84CC16']
  let burstCount = 0

  function burst() {
    if (burstCount >= 22) return
    burstCount++
    const x = Math.random() * canvas.width  * 0.8 + canvas.width  * 0.1
    const y = Math.random() * canvas.height * 0.55 + canvas.height * 0.05
    const color = colors[Math.floor(Math.random() * colors.length)]
    const n = 80 + Math.floor(Math.random() * 40)
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n
      const speed = Math.random() * 7 + 2
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed * (Math.random() * 0.5 + 0.75),
        vy: Math.sin(angle) * speed * (Math.random() * 0.5 + 0.75) - 2,
        color, alpha: 1, size: Math.random() * 4 + 2,
      })
    }
    setTimeout(burst, 650)
  }
  burst()

  let frame = 0
  function animate() {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of particles) {
      if (p.alpha <= 0) continue
      p.x += p.vx; p.y += p.vy
      p.vy += 0.1; p.vx *= 0.99
      p.alpha -= 0.007
      ctx2d.globalAlpha = Math.max(0, p.alpha)
      ctx2d.fillStyle   = p.color
      ctx2d.beginPath()
      ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx2d.fill()
    }
    ctx2d.globalAlpha = 1
    frame++
    if (frame < 900) requestAnimationFrame(animate)
    else canvas.remove()
  }
  animate()
}

export default function OnboardingGuide() {
  const { activeStep, isActive, nextStep, prevStep, closeGuide, totalSteps } = useOnboarding()
  const [showCelebration, setShowCelebration] = useState(false)
  const launched = useRef(false)

  function handleFinish() {
    closeGuide()
    if (!launched.current) {
      launched.current = true
      setShowCelebration(true)
      launchFireworks()
      setTimeout(() => {
        setShowCelebration(false)
        launched.current = false
      }, 15000)
    }
  }

  const isLast = activeStep === totalSteps - 1

  /* ── Celebration ── */
  if (showCelebration) {
    return (
      <>
        <style>{`
          @keyframes fw-float   { 0%,100%{transform:translateY(0) scale(1);}50%{transform:translateY(-16px) scale(1.08);} }
          @keyframes fw-fadein  { from{opacity:0;transform:scale(0.7);}to{opacity:1;transform:scale(1);} }
        `}</style>
        <div style={{
          position:'fixed', inset:0, zIndex:9997,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(0,0,0,0.45)', pointerEvents:'none',
        }}>
          <div style={{ textAlign:'center', animation:'fw-fadein 0.6s ease forwards' }}>
            <span style={{ fontSize:96, display:'block', animation:'fw-float 2s ease-in-out infinite' }}>🎉</span>
            <h2 style={{
              color:'#fff', fontSize:'clamp(28px,6vw,52px)', fontWeight:900,
              margin:'16px 0 8px', textShadow:'0 4px 30px rgba(0,0,0,0.8)',
              letterSpacing:'-0.02em',
            }}>
              Bravo !
            </h2>
            <p style={{
              color:'rgba(255,255,255,0.92)', fontSize:'clamp(16px,3vw,24px)',
              fontWeight:600, textShadow:'0 2px 16px rgba(0,0,0,0.8)', margin:0,
            }}>
              Maintenant c&apos;est à toi de jouer !
            </p>
          </div>
        </div>
      </>
    )
  }

  if (!isActive || activeStep === null) return null

  const step = STEPS[activeStep]

  return (
    <>
      <style>{`
        @keyframes guide-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(217,119,6,0.8), 0 0 0 2px rgba(217,119,6,0.7); }
          70%  { box-shadow: 0 0 0 10px rgba(217,119,6,0), 0 0 0 2px rgba(217,119,6,0.7); }
          100% { box-shadow: 0 0 0 0 rgba(217,119,6,0),  0 0 0 2px rgba(217,119,6,0.7); }
        }
        @keyframes guide-slide-up {
          from { opacity:0; transform:translate(-50%,-50%) scale(0.95); }
          to   { opacity:1; transform:translate(-50%,-50%) scale(1); }
        }
      `}</style>

      {/* Dark overlay — pointer-events:none so sidebar & bottom nav restent cliquables */}
      <div style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.65)',
        zIndex:100, pointerEvents:'none',
      }} />

      {/* Modal card */}
      <div style={{
        position:'fixed', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)',
        zIndex:1000,
        width:'min(92vw, 460px)',
        maxHeight:'calc(100dvh - 120px)',
        overflowY:'auto',
        background:'#1A1A1F',
        border:'1px solid rgba(217,119,6,0.35)',
        borderRadius:20,
        padding:'24px 22px',
        boxShadow:'0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        animation:'guide-slide-up 0.3s ease forwards',
      }}>

        {/* Header — progress dots + close */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width:  i === activeStep ? 22 : 5,
                height: 5,
                borderRadius: 3,
                background: i === activeStep
                  ? '#D97706'
                  : i < activeStep
                    ? 'rgba(217,119,6,0.45)'
                    : 'rgba(255,255,255,0.15)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>
          <button onClick={closeGuide} style={{
            background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
            color:'rgba(255,255,255,0.45)', cursor:'pointer',
            borderRadius:8, width:28, height:28, fontSize:17,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'inherit',
          }}>×</button>
        </div>

        {/* Step label */}
        <div style={{ fontSize:11, color:'#D97706', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:14 }}>
          Étape {activeStep + 1} / {totalSteps}
        </div>

        {/* Emoji + title */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14 }}>
          <div style={{
            width:52, height:52, borderRadius:14, flexShrink:0,
            background:'rgba(217,119,6,0.1)', border:'1px solid rgba(217,119,6,0.25)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:26,
          }}>
            {step.emoji}
          </div>
          <h3 style={{ fontSize:18, fontWeight:700, color:'#F0F0F2', margin:0, lineHeight:1.3 }}>
            {step.title}
          </h3>
        </div>

        {/* Description */}
        <p style={{ fontSize:14, color:'#9E9EAD', lineHeight:1.65, margin:'0 0 14px' }}>
          {step.description}
        </p>

        {/* Tip */}
        <div style={{
          background:'rgba(217,119,6,0.07)', border:'1px solid rgba(217,119,6,0.2)',
          borderRadius:10, padding:'10px 14px', marginBottom:20,
          display:'flex', gap:8, alignItems:'flex-start',
        }}>
          <span style={{ fontSize:13, flexShrink:0, marginTop:1 }}>💡</span>
          <p style={{ fontSize:13, color:'rgba(217,119,6,0.85)', margin:0, lineHeight:1.5 }}>{step.tip}</p>
        </div>

        {/* Nav hint */}
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginBottom:20, display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ color:'#D97706', fontSize:10 }}>✦</span>
          <span>
            <span style={{ color:'rgba(255,255,255,0.45)', fontWeight:600 }}>"{step.label}"</span>
            {' '}est mis en surbrillance dans la navigation
          </span>
        </div>

        {/* Buttons */}
        <div style={{ display:'flex', gap:8 }}>
          {activeStep > 0 && (
            <button onClick={prevStep} style={{
              flex:1, padding:'11px', borderRadius:10,
              background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
              color:'rgba(255,255,255,0.55)', fontSize:14, fontWeight:600,
              cursor:'pointer', fontFamily:'inherit',
            }}>
              ← Précédent
            </button>
          )}
          <button
            onClick={isLast ? handleFinish : nextStep}
            style={{
              flex:2, padding:'11px', borderRadius:10, border:'none',
              color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer',
              fontFamily:'inherit',
              background: isLast
                ? 'linear-gradient(135deg, #D97706, #F59E0B)'
                : 'linear-gradient(135deg, #1D9E75, #0F6E56)',
              boxShadow: isLast
                ? '0 4px 20px rgba(217,119,6,0.4)'
                : '0 4px 20px rgba(29,158,117,0.3)',
            }}
          >
            {isLast ? '🎉 Terminer le guide !' : 'Suivant →'}
          </button>
        </div>
      </div>
    </>
  )
}
