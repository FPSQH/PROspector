'use client'

import { useState } from 'react'

export function CreateUserForm() {
  const [form, setForm] = useState({ email: '', prenom: '', nom: '', role: 'commercial' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setSuccess('')

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? 'Erreur inconnue'); return }
    setSuccess(`Compte créé pour ${form.prenom} ${form.nom}. Un email de connexion lui a été envoyé.`)
    setForm({ email: '', prenom: '', nom: '', role: 'commercial' })
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #d1d0c8',
    borderRadius: 8, fontSize: '0.9rem', outline: 'none',
    background: '#fff', color: '#1a1a18',
  }

  return (
    <form onSubmit={handleSubmit}>
      {success && (
        <div style={{ background: '#E1F5EE', border: '1px solid #9FE1CB', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.875rem', color: '#085041' }}>
          {success}
        </div>
      )}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.875rem', color: '#991f1f' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 4 }}>Prénom</label>
          <input style={inputStyle} value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} required placeholder="Jean"/>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 4 }}>Nom</label>
          <input style={inputStyle} value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required placeholder="Dupont"/>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 4 }}>Email professionnel</label>
        <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="jean.dupont@squarehabitat.fr"/>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: 4 }}>Rôle</label>
        <select style={inputStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
          <option value="commercial">Commercial</option>
          <option value="manager">Manager</option>
        </select>
      </div>

      <button type="submit" disabled={loading} style={{
        padding: '10px 20px', background: loading ? '#9FE1CB' : '#1D9E75',
        color: '#fff', border: 'none', borderRadius: 8,
        fontSize: '0.875rem', fontWeight: 500, cursor: loading ? 'default' : 'pointer',
      }}>
        {loading ? 'Création…' : 'Créer le compte et envoyer l\'invitation'}
      </button>
    </form>
  )
}
