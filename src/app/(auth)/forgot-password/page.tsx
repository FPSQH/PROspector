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

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">📧</div>
          <h2 className="text-xl font-bold">Email envoyé</h2>
          <p className="text-gray-500 text-sm">
            Si cette adresse est connue, un lien de réinitialisation a été envoyé.
            Vérifiez votre boîte mail (et vos spams).
          </p>
          <Link href="/login" className="block text-blue-600 text-sm hover:underline">
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow p-8 max-w-sm w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
          <p className="text-gray-500 text-sm mt-1">
            Entrez votre email pour recevoir un lien de réinitialisation.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="votre@email.com"
            required
            autoComplete="email"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Envoi en cours…' : 'Envoyer le lien'}
          </button>
        </form>
        <div className="text-center">
          <Link href="/login" className="text-gray-400 text-sm hover:underline">
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  )
}
