'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ChangePasswordPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [newPass,  setNewPass]  = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPass !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (newPass.length < 8)  { setError('8 caractères minimum.'); return }
    setLoading(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password: newPass })
    if (updateError) { setError(updateError.message); setLoading(false); return }
    await fetch('/api/auth/clear-password-flag', { method: 'POST' })
    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.replace('/dashboard'), 1500)
  }

  const wrapStyle: React.CSSProperties = {
    minHeight: '100dvh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#f8f7f4', padding: '24px',
  }
  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '40px 36px', width: '100%', maxWidth: '400px',
    display: 'flex', flexDirection: 'column', gap: '20px',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #B4B2A9', borderRadius: '8px',
    padding: '12px 14px', fontSize: '15px', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const btnStyle: React.CSSProperties = {
    width: '100%', background: '#1D9E75', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '13px', fontSize: '15px',
    fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1,
  }

  if (success) {
    return (
      <div style={wrapStyle}>
        <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>✅</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Mot de passe mis à jour</h2>
          <p style={{ color: '#5F5E5A', fontSize: '14px', margin: 0 }}>Redirection en cours…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Changer le mot de passe</h1>
          <p style={{ color: '#5F5E5A', fontSize: '14px', margin: '6px 0 0' }}>
            Choisissez un nouveau mot de passe sécurisé (8 caractères minimum).
          </p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
            placeholder="Nouveau mot de passe" required minLength={8} style={inputStyle} />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirmer le mot de passe" required minLength={8} style={inputStyle} />
          {error && <p style={{ color: '#E24B4A', fontSize: '13px', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Enregistrement…' : 'Mettre à jour le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}
