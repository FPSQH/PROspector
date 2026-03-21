'use client'

import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(errorParam ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Ne pas créer de compte si l'email n'existe pas encore
        // (les comptes sont créés par le manager)
        shouldCreateUser: false,
      },
    })

    setLoading(false)
    if (err) {
      setError('Email non reconnu. Contactez votre responsable pour créer votre accès.')
    } else {
      setSent(true)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8f7f4',
      padding: '1rem',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: '380px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 52, height: 52, borderRadius: '14px', background: '#1D9E75', marginBottom: '1rem',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 22V12M2 7l10 5 10-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#1a1a18', margin: 0 }}>PROspector</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b6b67', marginTop: '0.25rem' }}>
            Square Habitat – Outil de prospection
          </p>
        </div>

        {/* État : lien envoyé */}
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: '#E1F5EE',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: 8 }}>Vérifiez votre boîte mail</p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b67', lineHeight: 1.6 }}>
              Un lien de connexion a été envoyé à <strong>{email}</strong>.<br/>
              Cliquez sur le lien pour accéder à l'application.
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              style={{
                marginTop: '1.25rem', fontSize: '0.8rem', color: '#1D9E75',
                background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Utiliser un autre email
            </button>
          </div>
        ) : (
          /* Formulaire email */
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
                padding: '0.75rem 1rem', marginBottom: '1.25rem',
                fontSize: '0.875rem', color: '#991f1f',
              }}>
                {error}
              </div>
            )}

            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 6 }}>
              Adresse email professionnelle
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="prenom.nom@squarehabitat.fr"
              required
              style={{
                width: '100%', padding: '12px 14px',
                border: '1.5px solid #d1d0c8', borderRadius: '10px',
                fontSize: '0.9375rem', color: '#1a1a18', background: '#fff',
                outline: 'none', transition: 'border-color 0.15s',
                marginBottom: '1rem',
              }}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#1D9E75'}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = '#d1d0c8'}
            />

            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                width: '100%', padding: '13px',
                background: loading || !email.trim() ? '#9FE1CB' : '#1D9E75',
                color: '#fff', border: 'none', borderRadius: '10px',
                fontSize: '0.9375rem', fontWeight: 500,
                cursor: loading || !email.trim() ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.2s',
              }}
            >
              {loading && (
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
                  animation: 'spin 0.6s linear infinite',
                }}/>
              )}
              {loading ? 'Envoi en cours…' : 'Recevoir le lien de connexion'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9b9b96', marginTop: '1.25rem' }}>
              Un lien de connexion vous sera envoyé par email.<br/>
              Pas de mot de passe à retenir.
            </p>
          </form>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
