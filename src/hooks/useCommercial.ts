'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Commercial } from '@/types/database'

export function useCommercial() {
  const [commercial, setCommercial] = useState<Commercial | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('commerciaux')
        .select('*')
        .eq('id', user.id)
        .single()

      setCommercial(data)
      setLoading(false)
    }

    load()
  }, [])

  return { commercial, loading }
}
