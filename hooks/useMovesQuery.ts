// hooks/useMovesQuery.ts
import { useQuery, useMutation } from '../lib/reactQuery'
import { useCallback, useEffect } from 'react'
import supabase from '../lib/supabase'
import { Move } from '../types/move'
import { queryClient } from '../lib/queryClient'

const IS_DEV = (globalThis as any).__DEV__ === true

type RealtimeChannel = ReturnType<typeof supabase.channel>

export type MoveRow = {
  id: string
  user_id: string
  name: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  tags: string[]
  notes: string | null
  video_url: string | null
  image_url: string | null
  created_at: string
}

type MoveUpsertInput = {
  name: string
  difficulty: MoveRow['difficulty']
  tags: string[]
  notes?: string | null
  videoUrl?: string | null
  imageUrl?: string | null
  thumbUrl?: string | null
}

function mapRowToMove(row: MoveRow): Move {
  return {
    id: row.id,
    name: row.name,
    difficulty: row.difficulty,
    tags: row.tags || [],
    notes: row.notes || undefined,
    videoUrl: (row as any).video_url_web || (row as any).video_url_original || row.video_url || null,
    imageUrl: row.image_url || null,
    thumbUrl: (row as any).thumb_url || row.image_url || null,
    createdAt: row.created_at,
  }
}

function sanitizeString(input: any, maxLen: number) {
  const s = String(input ?? '')
  // Trim and remove control characters
  const cleaned = s.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned
}

function sanitizeTags(tags: any) {
  const arr = Array.isArray(tags) ? tags : []
  const cleaned = arr
    .map((t) => sanitizeString(t, 24))
    .filter(Boolean)
    .slice(0, 12)
  // de-dupe case-insensitively
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of cleaned) {
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

export function useMoves(uid: string | null | undefined) {
  const { data: moves = [], isLoading, refetch } = useQuery({
    queryKey: ['moves', uid],
    queryFn: async (): Promise<Move[]> => {
      if (!uid) return []
      
      const { data, error } = await supabase
        .from('moves')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      return (data || []).map((row: MoveRow) => mapRowToMove(row))
    },
    enabled: !!uid,
    staleTime: 30_000, // 30s — Realtime handles live updates, no need to refetch on every navigation
    refetchOnWindowFocus: false, // Realtime handles this
    refetchOnReconnect: true,
    gcTime: 5 * 60 * 1000,
  })

  // Realtime subscription
  useEffect(() => {
    if (!uid) return

    if (IS_DEV) console.log(`[moves-realtime] subscribing for uid=${uid}`)
    const channel: RealtimeChannel = supabase
      .channel('moves-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'moves',
          filter: `user_id=eq.${uid}`,
        },
        (_payload: any) => {
          queryClient.invalidateQueries({ queryKey: ['moves', uid] })
        }
      )
      .subscribe()

    return () => {
      if (IS_DEV) console.log(`[moves-realtime] unsubscribing`)
      channel.unsubscribe()
    }
  }, [uid])

  const createMutation = useMutation({
    mutationFn: async (input: MoveUpsertInput) => {
      if (!uid) throw new Error('Must be signed in')

      const safeName = sanitizeString(input.name, 80)
      if (!safeName) throw new Error('Move name is required')

      const payloadWithUser = {
        user_id: uid,
        name: safeName,
        difficulty: input.difficulty,
        tags: sanitizeTags(input.tags),
        notes: input.notes != null ? sanitizeString(input.notes, 2000) : null,
        // Prefer new column name but keep backward compatibility
        video_url_original: input.videoUrl ?? null,
        image_url: input.imageUrl ?? null,
      }

      // Attempt with explicit user_id first (satisfies WITH CHECK). If the DB has a default
      // and rejects explicit user_id for any reason, fall back to relying on DEFAULT auth.uid().
      let res = await supabase.from('moves').insert(payloadWithUser).select('*').single()
      if (res.error) {
        const msg = String(res.error.message || '').toLowerCase()
        const isRls = msg.includes('row-level security') || msg.includes('policy') || msg.includes('rls')
        if (isRls) {
          const { user_id: _omit, ...payloadWithoutUser } = payloadWithUser as any
          res = await supabase.from('moves').insert(payloadWithoutUser).select('*').single()
        }
      }

      if (res.error) throw res.error
      return mapRowToMove(res.data as any)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moves', uid] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (args: { id: string; patch: MoveUpsertInput }) => {
      if (!uid) throw new Error('Must be signed in')

      const { id, patch } = args
      const updatePayload: any = {
        ...(patch.name !== undefined ? { name: sanitizeString(patch.name, 80) } : {}),
        ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
        ...(patch.tags !== undefined ? { tags: sanitizeTags(patch.tags) } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes != null ? sanitizeString(patch.notes, 2000) : null } : {}),
        ...(patch.videoUrl !== undefined ? { video_url_original: patch.videoUrl ?? null } : {}),
        ...(patch.imageUrl !== undefined ? { image_url: patch.imageUrl ?? null } : {}),
      }

      const { data, error } = await supabase.from('moves').update(updatePayload).eq('id', id).select('*').single()
      if (error) throw error
      return mapRowToMove(data as any)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moves', uid] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!uid) throw new Error('Must be signed in')
      
      // Fetch the move to get its media paths
      const move = moves.find((m: Move) => m.id === id)
      
      const { error } = await supabase.from('moves').delete().eq('id', id)
      if (error) throw error

      // Best-effort cleanup of storage objects
      if (move) {
        const pathsToDelete: string[] = []
        if (move.videoUrl) {
          // Extract path from public URL
          const videoPath = extractStoragePath(move.videoUrl)
          if (videoPath) pathsToDelete.push(videoPath)
        }
        if (move.imageUrl) {
          const imagePath = extractStoragePath(move.imageUrl)
          if (imagePath) pathsToDelete.push(imagePath)
        }
        if (move.thumbUrl && move.thumbUrl !== move.imageUrl) {
          const thumbPath = extractStoragePath(move.thumbUrl)
          if (thumbPath) pathsToDelete.push(thumbPath)
        }

        if (pathsToDelete.length > 0) {
          try {
            const { error: storageError } = await supabase.storage.from('moves').remove(pathsToDelete)
            if (storageError) console.warn('[delete-move] storage cleanup error (non-critical):', storageError)
          } catch (e) {
            console.warn('[delete-move] storage cleanup failed (non-critical):', e)
          }
        }
      }
    },
    onSuccess: () => {
      console.log('[moves] invalidated after delete')
      queryClient.invalidateQueries({ queryKey: ['moves', uid] })
    },
  })

  const invalidate = useCallback(() => {
    console.log('[moves] manual invalidate')
    queryClient.invalidateQueries({ queryKey: ['moves', uid] })
  }, [uid])

  return {
    moves,
    isLoading,
    refetch,
    createMove: createMutation.mutateAsync,
    updateMove: (id: string, patch: MoveUpsertInput) => updateMutation.mutateAsync({ id, patch }),
    deleteMove: deleteMutation.mutateAsync,
    invalidate,
  }
}

// Helper to extract storage path from public URL
function extractStoragePath(url: string): string | null {
  try {
    const URLCtor = (globalThis as any).URL
    if (URLCtor) {
      const parsed = new URLCtor(url)
      const idx = parsed.pathname.indexOf('/object/public/moves/')
      if (idx !== -1) {
        const path = parsed.pathname.substring(idx + '/object/public/moves/'.length)
        return path.split('?')[0]
      }
    }
    // Fallback regex for environments without URL
    const match = url.match(/\/object\/public\/moves\/(.*?)(\?|$)/)
    if (match && match[1]) return match[1]
  } catch (e) {
    console.warn('Failed to parse storage URL:', url)
  }
  return null
}