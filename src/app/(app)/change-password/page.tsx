'use client'

// src/app/(app)/change-password/page.tsx
// Accessible depuis le profil pour changer son mot de passe.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ChangePasswordPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [current,  setCurrent]  = useState('')
  const [newPass,  setNewPass]  = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (newPass.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (newPass !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)

    // Vérifier le mot de passe actuel en retentant la connexion
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setError('Session expirée.'); setLoading(false); return }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    user.email,
      password: current,
    })
    if (signInErr) {
      setError('Mot de passe actuel incorrect.')
      setLoading(false)
      return
    }

    // Changer le mot de passe
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPass })
    setLoading(false)

    if (updateErr) {
      setError(updateErr.message)
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: '1.5px solid #d1d0c8', borderRadius: 8,
    fontSize: '0.9rem', outline: 'none',
    background: '#fff', color: '#1a1a18',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ maxWidth: 440, margin: '2rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '1.5rem' }}>
        🔑 Changer mon mot de passe
      </h1>

      <div style={{
        background: '#fff', borderRadius: 12, padding: '1.5rem',
        border: '1.5px solid #e8e7e0',
      }}>
        {success ? (
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 8, padding: '14px', textAlign: 'center',
            color: '#16a34a', fontWeight: 600,
          }}>
            ✅ Mot de passe modifié ! Redirection…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 8, padding: '10px 14px', marginBottom: 14,
                fontSize: '0.875rem', color: '#dc2626',
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5F5E5A', display: 'block', marginBottom: 5 }}>
                Mot de passe actuel
              </label>
              <input style={inputStyle} type="password" value={current}
                onChange={e => setCurrent(e.target.value)} required
                placeholder="Mot de passe actuel ou temporaire" autoComplete="current-password"/>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5F5E5A', display: 'block', marginBottom: 5 }}>
                Nouveau mot de passe
              </label>
              <input style={inputStyle} type="password" value={newPass}
                onChange={e => setNewPass(e.target.value)} required
                placeholder="8 caractères minimum" autoComplete="new-password"/>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5F5E5A', display: 'block', marginBottom: 5 }}>
                Confirmer le nouveau mot de passe
              </label>
              <input style={inputStyle} type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)} required
                placeholder="Répétez le nouveau mot de passe" autoComplete="new-password"/>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => router.back()}
                style={{
                  padding: '10px 16px', borderRadius: 8,
                  background: '#f8f7f4', border: '1px solid #e8e7e0',
                  color: '#5F5E5A', cursor: 'pointer', fontSize: '0.875rem',
                }}>
                Annuler
              </button>
              <button type="submit" disabled={loading}
                style={{
                  flex: 1, padding: '10px',
                  background: loading ? '#9b9b96' : '#1D9E75',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: '0.875rem', fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}>
                {loading ? '…' : 'Modifier le mot de passe'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
