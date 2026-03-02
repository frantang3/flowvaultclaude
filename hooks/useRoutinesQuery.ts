// hooks/useRoutinesQuery.ts
import { useQuery, useMutation } from '../lib/reactQuery'
import { useCallback, useEffect } from 'react'
import supabase from '../lib/supabase'
import { RoutineRow } from '../lib/routines'
import { queryClient } from '../lib/queryClient'
import { setRoutinesReachable } from '../lib/diagnostics'

type RealtimeChannel = ReturnType<typeof supabase.channel>

export function useRoutines(uid: string | null | undefined) {
  const { data: routines = [], isLoading, refetch } = useQuery({
    queryKey: ['routines', uid],
    queryFn: async (): Promise<RoutineRow[]> => {
      if (!uid) return []
      
      const { data, error } = await supabase
        .from('routines')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) { setRoutinesReachable(false); throw error }
      setRoutinesReachable(true)
      return (data || []) as RoutineRow[]
    },
    enabled: !!uid,
    staleTime: 30_000, // 30s — Realtime handles live updates
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    gcTime: 5 * 60 * 1000,
  })

  // Realtime subscription
  useEffect(() => {
    if (!uid) return

    console.log(`[routines-realtime] subscribing for uid=${uid}`)
    const channel: RealtimeChannel = supabase
      .channel('routines-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'routines',
          filter: `user_id=eq.${uid}`,
        },
        (payload: any) => {
          console.log(`[routines-realtime] change detected:`, payload.eventType)
          queryClient.invalidateQueries({ queryKey: ['routines', uid] })
        }
      )
      .subscribe()

    return () => {
      console.log(`[routines-realtime] unsubscribing`)
      channel.unsubscribe()
    }
  }, [uid])

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!uid) throw new Error('Must be signed in')
      const { error } = await supabase.from('routines').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      console.log('[routines] invalidated after delete')
      queryClient.invalidateQueries({ queryKey: ['routines', uid] })
    },
  })

  const invalidate = useCallback(() => {
    console.log('[routines] manual invalidate')
    queryClient.invalidateQueries({ queryKey: ['routines', uid] })
  }, [uid])

  return {
    routines,
    isLoading,
    refetch,
    deleteRoutine: deleteMutation.mutateAsync,
    invalidate,
  }
}