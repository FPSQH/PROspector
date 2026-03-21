'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Commune } from '@/types/database'

export function useCommunes(commercialId: string | undefined) {
  const [communes, setCommunes] = useState<Commune[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!commercialId) return
    const supabase = createClient()
    const { data } = await supabase
      .from('communes')
      .select('*')
      .eq('commercial_id', commercialId)
      .order('nom')
    setCommunes(data ?? [])
    setLoading(false)
  }, [commercialId])

  useEffect(() => { refresh() }, [refresh])

  return { communes, loading, refresh }
}
