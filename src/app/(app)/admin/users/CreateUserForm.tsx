'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface CreateResult {
  temp_password: string
  user_id: string
}

export default function CreateUserForm() {
  const router = useRouter()
  const [email,  setEmail]  = useState('')
  const [nom,    setNom]    = useState('')
  const [prenom, setPrenom] = useState('')
  const [role, setRole] = useState('commercial')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<CreateResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [emailState, setEmailState] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, nom, prenom, role }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Erreur lors de la création')
    } else {
      setResult(data)
      setEmailState(email)
      setEmail('')
      setNom('')
      setPrenom('')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-semibold text-gray-700">Créer un compte commercial</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-3">
          <input
            value={prenom}
            onChange={e => setPrenom(e.target.value)}
            placeholder="Prénom"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={nom}
            onChange={e => setNom(e.target.value)}
            placeholder="Nom *"
            required
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#5F5E5A', marginBottom: 6 }}>
            Rôle
          </label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #B4B2A9', fontSize: 14, background: '#fff', outline: 'none' }}
          >
            <option value="commercial">Commercial</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email *"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Création…' : 'Créer le compte'}
        </button>
      </form>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
          <p className="text-green-800 font-medium text-sm">✅ Compte créé</p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Email :</span> {emailState}
          </p>
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <span className="font-medium">Mot de passe temporaire :</span>
            <code className="bg-white border border-gray-200 px-2 py-0.5 rounded font-mono text-gray-800 select-all">
              {result.temp_password}
            </code>
          </p>
          <p className="text-xs text-gray-400">
            Le commercial devra changer son mot de passe à la première connexion.
          </p>
        </div>
      )}
    </div>
  )
}
