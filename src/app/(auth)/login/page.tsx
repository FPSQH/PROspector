'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    })

    setLoading(false)
    if (err) {
      setError('Email non reconnu. Contactez votre responsable.')
    } else {
      setSent(true)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8f7f4', padding: '1rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '2.5rem 2rem',
        width: '100%', maxWidth: '380px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, borderRadius: '14px', background: '#1D9E75',
            marginBottom: '1rem',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 22V12M2 7l10 5 10-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#1a1a18', margin: 0 }}>
            PROspector
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b6b67', marginTop: '0.25rem' }}>
            Square Habitat – Outil de prospection
          </p>
        </div>

        {sent ? (
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: '10px', padding: '1.25rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📧</div>
            <p style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 500, margin: 0 }}>
              Lien envoyé !
            </p>
            <p style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '0.5rem' }}>
              Vérifiez votre boîte mail et cliquez sur le lien de connexion.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: '8px', padding: '0.75rem 1rem',
                marginBottom: '1rem', fontSize: '0.875rem', color: '#991f1f',
              }}>
                {error}
              </div>
            )}

            <label style={{
              display: 'block', fontSize: '0.875rem',
              fontWeight: 500, color: '#374151', marginBottom: '0.5rem',
            }}>
              Adresse email professionnelle
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@squarehabitat.fr"
              required
              style={{
                width: '100%', padding: '0.75rem 1rem',
                border: '1.5px solid #d1d0c8', borderRadius: '10px',
                fontSize: '0.9375rem', color: '#1a1a18',
                outline: 'none', boxSizing: 'border-box',
                marginBottom: '1rem',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#1D9E75')}
              onBlur={(e)  => (e.target.style.borderColor = '#d1d0c8')}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.875rem',
                background: loading ? '#9b9b96' : '#1D9E75',
                color: '#fff', border: 'none', borderRadius: '10px',
                fontSize: '0.9375rem', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Envoi…' : 'Recevoir le lien de connexion'}
            </button>

            <p style={{
              textAlign: 'center', fontSize: '0.78rem',
              color: '#9b9b96', marginTop: '1rem',
            }}>
              Pas de mot de passe — connexion par lien email.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
