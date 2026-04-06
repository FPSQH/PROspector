'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase   = createClient()
  const router     = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password: password,
    })

    setLoading(false)
    if (err) {
      setError('Email ou mot de passe incorrect.')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid #d1d0c8', borderRadius: 10,
    fontSize: '0.9375rem', outline: 'none',
    background: '#fff', color: '#1a1a18',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8f7f4', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '2.5rem 2rem',
        width: '100%', maxWidth: 400,
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        border: '1px solid #e8e7e0',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#1D9E75', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', marginBottom: 12,
          }}>🏘️</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', margin: 0 }}>
            PROspector
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#9b9b96', marginTop: 4 }}>
            Square Habitat
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 14px',
              marginBottom: 16, fontSize: '0.875rem', color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5F5E5A', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="prenom.nom@squarehabitat.fr"
              required
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5F5E5A', display: 'block', marginBottom: 6 }}>
              Mot de passe
            </label>
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '13px',
              background: loading ? '#9b9b96' : '#1D9E75',
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: '0.9375rem', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p style={{ fontSize: '0.78rem', color: '#9b9b96', textAlign: 'center', marginTop: 20, lineHeight: 1.5 }}>
          Accès réservé aux conseillers Square Habitat.<br/>
          Contactez votre responsable si vous n'avez pas vos identifiants.
        </p>
      </div>
    </div>
  )
}
