'use client'

import { useState, useEffect, useRef } from 'react'
import type { Commune } from '@/types/database'

interface Props {
  commune: Commune
  onRemove: (code_insee: string) => void
}

type PipelineStep = 'idle' | 'ban' | 'dpe_ingest' | 'dpe_match' | 'done' | 'error'

interface Statut {
  chargee: boolean
  chargee_at: string | null
  nb_adresses: number
  dpe_chargee?: boolean
  nb_dpe?: number
}

export function CommuneCard({ commune, onRemove }: Props) {
  const [statut, setStatut]     = useState<Statut | null>(null)
  const [removing, setRemoving] = useState(false)
  const [step, setStep]         = useState<PipelineStep>('idle')
  const [stepMsg, setStepMsg]   = useState('')
  const runningRef = useRef(false)

  async function runPipeline() {
    if (runningRef.current) return
    runningRef.current = true
    try {
      // ── Étape 1 : BAN ──────────────────────────────────────────
      const statRes = await fetch('/api/communes/statut?code_insee=' + commune.code_insee)
      const statData = await statRes.json()
      setStatut(statData)

      if (!statData.chargee) {
        setStep('ban')
        setStepMsg('Chargement des adresses BAN...')
        const banRes = await fetch('/api/ingestion/ban', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({code_insee: commune.code_insee, commune_id: commune.id}),
        })
        const banData = await banRes.json()
        if (!banRes.ok) throw new Error('BAN: ' + (banData.error ?? banRes.status))
        setStepMsg('BAN: ' + (banData.count ?? 0) + ' adresses chargées')
      }

      // ── Étape 2 : Ingest DPE ───────────────────────────────────
      const statRes2 = await fetch('/api/communes/statut?code_insee=' + commune.code_insee)
      const statData2 = await statRes2.json()
      setStatut(statData2)

      if (!statData2.dpe_chargee) {
        setStep('dpe_ingest')
        setStepMsg('Ingestion des DPE...')
        let after: string | null = null
        let totalDpe = 0
        let page = 0
        while (true) {
          const r = await fetch('/api/dpe/ingest', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({code_postal: commune.code_postal ?? '', code_insee: commune.code_insee, after}),
          })
          const d = await r.json()
          if (!r.ok) break
          totalDpe += d.nb_inserted ?? 0
          after = d.after ?? null
          page++
          setStepMsg('DPE: ' + totalDpe + ' enregistrés (page ' + page + ')')
          if (!after || d.has_more === false) break
          if (page > 100) break
        }
        setStepMsg('DPE ingestion terminée: ' + totalDpe + ' DPE')
      }

      // ── Étape 3 : Match DPE → adresses ─────────────────────────
      setStep('dpe_match')
      setStepMsg('Matching DPE avec les adresses...')
      let totalMatched = 0, totalQualified = 0, matchPage = 0
      while (true) {
        const r = await fetch('/api/dpe/match', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({code_insee: commune.code_insee, limit: 200}),
        })
        const d = await r.json()
        if (!r.ok) break
        const matched = (d.nb_matched_textuel ?? 0) + (d.nb_matched_voie ?? 0) + (d.nb_matched_spatial ?? 0)
        totalMatched += matched
        totalQualified += d.nb_qualified ?? 0
        matchPage++
        setStepMsg('Match: ' + totalMatched + ' DPE liés, ' + totalQualified + ' adresses qualifiées')
        if (d.nb_unmatched === 0 || matched === 0) break
        if (matchPage > 50) break
      }

      setStep('done')
      setStepMsg(totalQualified + ' adresses qualifiées via DPE')
    } catch(e: any) {
      setStep('error')
      setStepMsg('Erreur: ' + (e?.message ?? String(e)))
    } finally {
      // Rafraîchir le statut final
      const finalRes = await fetch('/api/communes/statut?code_insee=' + commune.code_insee)
      const finalData = await finalRes.json()
      setStatut(finalData)
      runningRef.current = false
    }
  }

  useEffect(() => {
    let pollTimer: NodeJS.Timeout
    async function fetchStatut() {
      try {
        const res = await fetch('/api/communes/statut?code_insee=' + commune.code_insee)
        const data = await res.json()
        setStatut(data)
        // Lancer le pipeline si la commune n'est pas encore prête
        if (!data.chargee && step === 'idle') {
          runPipeline()
        } else if (!data.dpe_chargee && data.chargee && step === 'idle') {
          runPipeline()
        } else if (!data.chargee) {
          pollTimer = setTimeout(fetchStatut, 3000)
        }
      } catch {
        pollTimer = setTimeout(fetchStatut, 5000)
      }
    }
    fetchStatut()
    return () => clearTimeout(pollTimer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commune.code_insee])

  async function handleRemove() {
    setRemoving(true)
    await fetch('/api/communes?code_insee=' + commune.code_insee, {method: 'DELETE'})
    onRemove(commune.code_insee)
  }

  const chargee = statut?.chargee ?? !!commune.chargee_at
  const isRunning = ['ban','dpe_ingest','dpe_match'].includes(step)
  const isDone = step === 'done' && chargee
  const hasError = step === 'error'

  const dotColor = isDone ? '#1D9E75' : hasError ? '#E24B4A' : isRunning ? '#3B82F6' : chargee ? '#1D9E75' : '#EF9F27'
  const dotShadow = isDone ? 'rgba(29,158,117,0.15)' : hasError ? 'rgba(226,75,74,0.15)' : isRunning ? 'rgba(59,130,246,0.2)' : chargee ? 'rgba(29,158,117,0.15)' : 'rgba(239,159,39,0.15)'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 14px', background: '#fff',
      border: '1.5px solid ' + (hasError ? '#fecaca' : isRunning ? '#bfdbfe' : '#e8e7e0'),
      borderRadius: 10, transition: 'border-color 0.2s',
    }}>
      <div style={{display:'flex', alignItems:'center', gap:12}}>
        {/* Indicateur statut */}
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: dotColor,
          boxShadow: '0 0 0 3px ' + dotShadow,
          ...(isRunning ? {animation: 'pulse 1.5s ease-in-out infinite'} : {}),
        }}/>

        {/* Infos commune */}
        <div style={{flex:1}}>
          <div style={{fontWeight:500, fontSize:'0.9375rem', color:'#1a1a18'}}>{commune.nom}</div>
          <div style={{fontSize:'0.8rem', color:'#9b9b96', marginTop:2}}>
            {commune.code_postal ?? commune.code_insee} · Dép. {commune.departement}
            {statut?.chargee && ' · ' + (statut.nb_adresses ?? 0).toLocaleString('fr-FR') + ' adresses'}
            {statut?.nb_dpe ? ' · ' + statut.nb_dpe + ' DPE' : ''}
          </div>
        </div>

        {/* Badge état */}
        {isRunning && (
          <div style={{display:'flex', alignItems:'center', gap:5, fontSize:'0.72rem', color:'#1D4ED8', fontWeight:600}}>
            <div style={{width:10,height:10,borderRadius:'50%',border:'2px solid #3B82F6',borderTopColor:'transparent',animation:'spin 0.7s linear infinite'}}/>
            {step === 'ban' ? 'BAN…' : step === 'dpe_ingest' ? 'DPE…' : 'Match…'}
          </div>
        )}
        {isDone && (
          <div style={{fontSize:'0.72rem', color:'#1D9E75', fontWeight:600}}>✓ Prêt</div>
        )}
        {hasError && (
          <button onClick={() => { runningRef.current = false; setStep('idle'); runPipeline() }}
            style={{fontSize:'0.72rem', color:'#E24B4A', fontWeight:600, background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>
            Réessayer
          </button>
        )}

        {/* Bouton supprimer */}
        <button onClick={handleRemove} disabled={removing || isRunning} title="Retirer cette commune"
          style={{width:32,height:32,borderRadius:8,border:'1px solid #e8e7e0',background:'transparent',cursor:removing||isRunning?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'#9b9b96',opacity:isRunning?0.4:1}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Barre de progression message */}
      {(isRunning || hasError) && stepMsg && (
        <div style={{fontSize:'0.72rem', color: hasError ? '#E24B4A' : '#6b7280', paddingLeft:22}}>
          {stepMsg}
        </div>
      )}
      {isDone && stepMsg && (
        <div style={{fontSize:'0.72rem', color:'#1D9E75', paddingLeft:22}}>✓ {stepMsg}</div>
      )}
    </div>
  )
}
