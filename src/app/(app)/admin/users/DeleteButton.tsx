'use client'

export default function DeleteButton({ userId }: { userId: string }) {
  async function handleDelete() {
    if (!confirm('Supprimer ce compte ? Cette action est irréversible.')) return
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    if (res.ok) window.location.reload()
    else alert('Erreur lors de la suppression')
  }

  return (
    <button
      onClick={handleDelete}
      style={{
        background: 'none', border: '1px solid #E24B4A', color: '#E24B4A',
        borderRadius: '8px', padding: '5px 12px', fontSize: '13px',
        cursor: 'pointer', fontWeight: 500,
      }}
    >
      Supprimer
    </button>
  )
}
