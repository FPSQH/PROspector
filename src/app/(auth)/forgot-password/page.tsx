'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setSent(true)
    } catch {
      setError('Erreur réseau, réessayez.')
    }
    setLoading(false)
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
    width: '100%', background: '#1D9E75', color: '#fff',
    border: 'none', borderRadius: '8px', padding: '13px',
    fontSize: '15px', fontWeight: 600, cursor: 'pointer',
    opacity: loading ? 0.6 : 1,
  }

  if (sent) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📧</div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Email envoyé</h2>
          </div>
          <p style={{ color: '#5F5E5A', fontSize: '14px', margin: 0, textAlign: 'center' }}>
            Si cette adresse est connue, un lien de réinitialisation a été envoyé.
            Vérifiez votre boîte mail et vos spams.
          </p>
          <Link href="/login" style={{ textAlign: 'center', color: '#1D9E75', fontSize: '14px', textDecoration: 'none' }}>
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Mot de passe oublié</h1>
          <p style={{ color: '#5F5E5A', fontSize: '14px', margin: '6px 0 0' }}>
            Entrez votre email pour recevoir un lien de réinitialisation.
          </p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="votre@email.com"
            required
            autoComplete="email"
            style={inputStyle}
          />
          {error && <p style={{ color: '#E24B4A', fontSize: '13px', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Envoi en cours…' : 'Envoyer le lien'}
          </button>
        </form>
        <Link href="/login" style={{ textAlign: 'center', color: '#5F5E5A', fontSize: '13px', textDecoration: 'none' }}>
          ← Retour à la connexion
        </Link>
      </div>
    </div>
  )
}
