'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const supabase   = createClient()
  const router     = useRouter()
  const searchParams = useSearchParams()
  const isExpired  = searchParams.get('error') === 'auth_callback'

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password: password,
    })
    if (err) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  const wrapStyle: React.CSSProperties = {
    minHeight: '100dvh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#f8f7f4', padding: '24px',
  }
  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '40px 36px', width: '100%', maxWidth: '400px',
    display: 'flex', flexDirection: 'column', gap: '24px',
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

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>PROspector</h1>
          <p style={{ color: '#5F5E5A', fontSize: '14px', margin: '6px 0 0' }}>
            Connectez-vous à votre espace
          </p>
        </div>

        {isExpired && (
          <div style={{ background: '#FEF3C7', border: '1px solid #EF9F27', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#92400E' }}>
            Le lien a expiré. Reconnectez-vous ou recommencez la procédure.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="votre@email.com" required autoComplete="email" style={inputStyle}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mot de passe" required autoComplete="current-password" style={inputStyle}
            />
            <div style={{ textAlign: 'right' }}>
              <Link href="/forgot-password" style={{ fontSize: '13px', color: '#1D9E75', textDecoration: 'none' }}>
                Mot de passe oublié ?
              </Link>
            </div>
          </div>
          {error && <p style={{ color: '#E24B4A', fontSize: '13px', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
