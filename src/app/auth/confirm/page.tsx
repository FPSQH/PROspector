'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    async function confirm() {
      const supabase = createClient()
      const url = new URL(window.location.href)
      const token_hash = url.searchParams.get('token_hash')
      const type = url.searchParams.get('type') as any

      if (token_hash && type) {
        const { data, error } = await supabase.auth.verifyOtp({ 
          token_hash, 
          type 
        })
        if (!error && data.session) {
          router.replace('/dashboard')
          return
        }
      }
      router.replace('/login?error=expired')
    }
    confirm()
  }, [])

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8f7f4',
    }}>
      <div style={{ textAlign: 'center', color: '#5F5E5A', fontSize: '0.875rem' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', margin: '0 auto 12px',
          border: '3px solid #d1d0c8', borderTopColor: '#1D9E75',
          animation: 'spin 0.7s linear infinite',
        }}/>
        Connexion en cours…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
