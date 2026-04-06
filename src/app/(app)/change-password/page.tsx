'use client'

// src/app/(app)/change-password/page.tsx
// Accessible depuis le profil OU lors de la première connexion (must_change_password).
// Pas besoin du mot de passe actuel : supabase.auth.updateUser() n'en nécessite pas.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ChangePasswordPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [newPass,  setNewPass]  = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPass !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (newPass.length < 8) {
      setError('8 caractères minimum.')
      return
    }
    setLoading(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password: newPass })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Effacer le flag must_change_password
    await fetch('/api/auth/clear-password-flag', { method: 'POST' })

    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.replace('/dashboard'), 1500)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-bold">Mot de passe mis à jour</h2>
          <p className="text-gray-500 text-sm">Redirection en cours…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow p-8 max-w-sm w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Changer le mot de passe</h1>
          <p className="text-gray-500 text-sm mt-1">
            Choisissez un nouveau mot de passe sécurisé (8 caractères minimum).
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            placeholder="Nouveau mot de passe"
            required
            minLength={8}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Confirmer le mot de passe"
            required
            minLength={8}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Enregistrement…' : 'Mettre à jour le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}
