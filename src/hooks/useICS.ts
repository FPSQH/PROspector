'use client'

// Usage :
//   const { downloadRdv, downloadSession } = useICS()
//   <button onClick={() => downloadRdv(rdv.id)}>Ajouter à Outlook</button>

export function useICS() {
  async function downloadRdv(rdvId: string) {
    const res = await fetch(`/api/ics?id=${rdvId}`)
    if (!res.ok) { alert('Impossible de générer le fichier calendrier'); return }
    triggerDownload(await res.blob(), res.headers.get('content-disposition'))
  }

  async function downloadSession(sessionId: string) {
    const res = await fetch('/api/ics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
    if (!res.ok) { alert('Impossible de générer le fichier calendrier'); return }
    triggerDownload(await res.blob(), res.headers.get('content-disposition'))
  }

  function triggerDownload(blob: Blob, contentDisposition: string | null) {
    const filename = contentDisposition?.match(/filename="(.+?)"/)?.[1] ?? 'event.ics'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return { downloadRdv, downloadSession }
}
