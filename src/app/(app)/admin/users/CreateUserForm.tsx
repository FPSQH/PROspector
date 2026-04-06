'use client'

// src/app/(app)/admin/users/CreateUserForm.tsx

import { useState } from 'react'

export function CreateUserForm() {
  const [form, setForm] = useState({ email: '', prenom: '', nom: '', role: 'commercial' })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setCredentials(null)

    const res  = await fetch('/api/admin/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Erreur inconnue')
      return
    }

    // Afficher les identifiants à communiquer
    setCredentials({ email: form.email, password: data.temp_password })
    setForm({ email: '', prenom: '', nom: '', role: 'commercial' })
  }

  const copyCredentials = () => {
    if (!credentials) return
    navigator.clipboard.writeText(
      `Email : ${credentials.email}\nMot de passe temporaire : ${credentials.password}\n\nConnectez-vous sur : https://prospector-sooty-seven.vercel.app/login`
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: '1.5px solid #d1d0c8', borderRadius: 8,
    fontSize: '0.9rem', outline: 'none',
    background: '#fff', color: '#1a1a18',
    boxSizing: 'border-box',
  }

  return (
    <div>
      {/* Identifiants à communiquer */}
      {credentials && (
        <div style={{
          background: '#f0fdf4', border: '1.5px solid #86efac',
          borderRadius: 10, padding: '1rem', marginBottom: 20,
        }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#166534', marginBottom: 8 }}>
            ✅ Compte créé — communiquez ces identifiants à la personne :
          </div>
          <div style={{
            background: '#fff', borderRadius: 8, padding: '10px 14px',
            fontFamily: 'monospace', fontSize: '0.875rem', color: '#1a1a18',
            lineHeight: 1.8, marginBottom: 10,
            border: '1px solid #bbf7d0',
          }}>
            <div><strong>Email :</strong> {credentials.email}</div>
            <div><strong>Mot de passe temporaire :</strong> {credentials.password}</div>
            <div style={{ marginTop: 4, fontSize: '0.8rem', color: '#5F5E5A' }}>
              URL : https://prospector-sooty-seven.vercel.app/login
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={copyCredentials}
              style={{
                padding: '6px 14px', borderRadius: 7,
                background: copied ? '#1D9E75' : '#fff',
                color: copied ? '#fff' : '#1D9E75',
                border: '1.5px solid #1D9E75',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {copied ? '✓ Copié !' : '📋 Copier les identifiants'}
            </button>
            <span style={{ fontSize: '0.75rem', color: '#9b9b96' }}>
              L'utilisateur pourra changer son mot de passe depuis son profil.
            </span>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, padding: '10px 14px', marginBottom: 14,
          fontSize: '0.875rem', color: '#991f1f',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 4 }}>Prénom</label>
            <input style={inputStyle} value={form.prenom}
              onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
              required placeholder="Jean"/>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 4 }}>Nom</label>
            <input style={inputStyle} value={form.nom}
              onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
              required placeholder="Dupont"/>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 4 }}>Email professionnel</label>
          <input style={inputStyle} type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            required placeholder="jean.dupont@squarehabitat.fr"/>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 4 }}>Rôle</label>
          <select style={inputStyle} value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            <option value="commercial">Commercial</option>
            <option value="manager">Manager</option>
          </select>
        </div>

        <button type="submit" disabled={loading} style={{
          padding: '10px 20px',
          background: loading ? '#9FE1CB' : '#1D9E75',
          color: '#fff', border: 'none', borderRadius: 8,
          fontSize: '0.875rem', fontWeight: 500,
          cursor: loading ? 'default' : 'pointer',
        }}>
          {loading ? 'Création…' : 'Créer le compte'}
        </button>
      </form>
    </div>
  )
}
