'use client'

// src/app/(app)/admin/users/UserList.tsx
// Composant client : liste des utilisateurs avec bouton supprimer.

import { useState } from 'react'

interface Commercial {
  id:      string
  email:   string
  prenom?: string
  nom?:    string
  role:    string
}

interface UserListProps {
  users:       Commercial[]
  currentUser: string  // user_id de la session — ne peut pas se supprimer lui-même
}

export function UserList({ users: initialUsers, currentUser }: UserListProps) {
  const [users, setUsers]       = useState<Commercial[]>(initialUsers)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const handleDelete = async (user: Commercial) => {
    if (!confirm(`Supprimer définitivement le compte de ${user.prenom ?? ''} ${user.nom ?? user.email} ?\n\nCette action est irréversible.`)) return

    setDeleting(user.id)
    setError(null)

    const res = await fetch('/api/admin/users', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: user.id }),
    })
    const data = await res.json()
    setDeleting(null)

    if (!res.ok) {
      setError(data.error ?? 'Erreur lors de la suppression')
      return
    }

    setUsers(prev => prev.filter(u => u.id !== user.id))
  }

  const initiales = (u: Commercial) => {
    const p = u.prenom?.[0] ?? ''
    const n = u.nom?.[0] ?? u.email[0]
    return (p + n).toUpperCase() || '?'
  }

  const roleBadge = (role: string) => ({
    background: role === 'manager' ? '#f0fdf4' : '#eff6ff',
    color:      role === 'manager' ? '#16a34a' : '#2563eb',
    border:     `1px solid ${role === 'manager' ? '#bbf7d0' : '#bfdbfe'}`,
  })

  return (
    <div>
      <div style={{ fontSize: '0.8rem', color: '#9b9b96', marginBottom: 12 }}>
        {users.length} utilisateur{users.length > 1 ? 's' : ''}
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, padding: '8px 12px',
          fontSize: '0.8rem', color: '#dc2626', marginBottom: 12,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map((u) => {
          const isSelf      = u.id === currentUser
          const isDeleting  = deleting === u.id
          const displayName = [u.prenom, u.nom].filter(Boolean).join(' ') || u.email

          return (
            <div
              key={u.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10,
                background: '#fafaf8', border: '1px solid #f0efeb',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: isSelf ? '#1D9E75' : '#e8e7e0',
                color: isSelf ? '#fff' : '#5F5E5A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
              }}>
                {initiales(u)}
              </div>

              {/* Infos */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1a1a18' }}>
                  {displayName}
                  {isSelf && <span style={{ fontSize: '0.7rem', color: '#9b9b96', fontWeight: 400, marginLeft: 6 }}>(vous)</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9b9b96', marginTop: 1 }}>{u.email}</div>
              </div>

              {/* Badge rôle */}
              <span style={{
                ...roleBadge(u.role),
                padding: '2px 10px', borderRadius: 20,
                fontSize: '0.75rem', fontWeight: 600,
                flexShrink: 0,
              }}>
                {u.role}
              </span>

              {/* Bouton supprimer */}
              {!isSelf && (
                <button
                  onClick={() => handleDelete(u)}
                  disabled={!!deleting}
                  title={`Supprimer ${displayName}`}
                  style={{
                    padding: '5px 10px', borderRadius: 7,
                    background: 'transparent', color: '#dc2626',
                    border: '1px solid #fecaca',
                    fontSize: '0.75rem', cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.5 : 1,
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {isDeleting ? '…' : '🗑 Supprimer'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
