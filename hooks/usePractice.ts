// hooks/usePractice.ts
// Manages practice goals, sessions, streaks, and per-move drill counts
import { useQuery, useMutation } from '../lib/reactQuery'
import { useCallback, useMemo } from 'react'
import supabase from '../lib/supabase'
import { queryClient } from '../lib/queryClient'
import type { Move } from '../types/move'

// ---------- Types ----------

export type PracticeGoal = {
  id: string
  user_id: string
  days_per_week: number
  moves_per_session: number
  updated_at: string
}

export type PracticeSession = {
  id: string
  user_id: string
  completed_at: string
  moves_drilled: string[]
  duration_seconds: number | null
  notes: string | null
}

export type MoveDrillCount = {
  move_id: string
  count: number
  last_drilled_at: string | null
}

// ---------- Helpers ----------

/** Get the start of the current week (Monday 00:00 local time as ISO) */
function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
  return monday.toISOString()
}

/** Get start of today as ISO */
function getTodayStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

/** Get start of day N days ago */
function getDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

// ---------- Hook ----------

export function usePractice(uid: string | null | undefined) {

  // ---- Practice Goal ----
  const { data: goal, isLoading: goalLoading } = useQuery({
    queryKey: ['practice-goal', uid],
    queryFn: async (): Promise<PracticeGoal | null> => {
      if (!uid) return null
      const { data, error } = await supabase
        .from('practice_goals')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle()
      if (error) throw error
      return data as PracticeGoal | null
    },
    enabled: !!uid,
    staleTime: 60_000,
  })

  const updateGoalMutation = useMutation({
    mutationFn: async (input: { days_per_week: number; moves_per_session: number }) => {
      if (!uid) throw new Error('Must be signed in')
      const { data, error } = await supabase
        .from('practice_goals')
        .upsert({
          user_id: uid,
          days_per_week: input.days_per_week,
          moves_per_session: input.moves_per_session,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select('*')
        .single()
      if (error) throw error
      return data as PracticeGoal
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-goal', uid] })
    },
  })

  // ---- Sessions (last 60 days for streak calc) ----
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['practice-sessions', uid],
    queryFn: async (): Promise<PracticeSession[]> => {
      if (!uid) return []
      const cutoff = getDaysAgo(60)
      const { data, error } = await supabase
        .from('practice_sessions')
        .select('*')
        .eq('user_id', uid)
        .gte('completed_at', cutoff)
        .order('completed_at', { ascending: false })
      if (error) throw error
      return (data || []) as PracticeSession[]
    },
    enabled: !!uid,
    staleTime: 30_000,
  })

  // ---- Per-move drill counts ----
  const { data: drillCounts = [], isLoading: drillsLoading } = useQuery({
    queryKey: ['move-drills', uid],
    queryFn: async (): Promise<MoveDrillCount[]> => {
      if (!uid) return []
      // Aggregate drill counts per move using RPC or manual grouping
      const { data, error } = await supabase
        .from('move_drills')
        .select('move_id, drilled_at')
        .eq('user_id', uid)
        .order('drilled_at', { ascending: false })
      if (error) throw error

      const map = new Map<string, { count: number; last: string | null }>()
      for (const row of (data || [])) {
        const existing = map.get(row.move_id)
        if (existing) {
          existing.count++
        } else {
          map.set(row.move_id, { count: 1, last: row.drilled_at })
        }
      }
      return Array.from(map.entries()).map(([move_id, v]) => ({
        move_id,
        count: v.count,
        last_drilled_at: v.last,
      }))
    },
    enabled: !!uid,
    staleTime: 30_000,
  })

  // ---- Computed: Streak ----
  const streak = useMemo(() => {
    if (sessions.length === 0) return 0

    // Get unique practice days (sorted descending)
    const practiceDays = new Set<string>()
    for (const s of sessions) {
      const d = new Date(s.completed_at)
      practiceDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    }

    const sortedDays = Array.from(practiceDays).sort().reverse()

    // Check if today or yesterday has a session (streak can't skip a day)
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`

    if (sortedDays[0] !== todayKey && sortedDays[0] !== yesterdayKey) {
      return 0 // streak is broken
    }

    // Count consecutive days backwards
    let count = 0
    const cursor = new Date(today)
    // If today doesn't have a session, start from yesterday
    if (sortedDays[0] !== todayKey) {
      cursor.setDate(cursor.getDate() - 1)
    }

    for (let i = 0; i < 60; i++) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`
      if (practiceDays.has(key)) {
        count++
        cursor.setDate(cursor.getDate() - 1)
      } else {
        break
      }
    }

    return count
  }, [sessions])

  // ---- Computed: This week's practice days ----
  const weekStart = getWeekStart()
  const daysThisWeek = useMemo(() => {
    const days = new Set<string>()
    for (const s of sessions) {
      if (s.completed_at >= weekStart) {
        const d = new Date(s.completed_at)
        days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
      }
    }
    return days.size
  }, [sessions, weekStart])

  // ---- Computed: Did the user practice today? ----
  const practicedToday = useMemo(() => {
    const todayStr = getTodayStart()
    return sessions.some(s => s.completed_at >= todayStr)
  }, [sessions])

  // ---- Computed: Total sessions ever (in our 60-day window) ----
  const totalSessions = sessions.length

  // ---- Computed: Total moves drilled ----
  const totalMovesDrilled = useMemo(() => {
    return drillCounts.reduce((sum, d) => sum + d.count, 0)
  }, [drillCounts])

  // ---- Generate a smart practice set ----
  const generatePracticeSet = useCallback((moves: Move[], count: number): Move[] => {
    if (moves.length === 0) return []
    const targetCount = Math.min(count, moves.length)

    // Build a score for each move: prioritize least-recently-drilled and least-drilled-overall
    const drillMap = new Map(drillCounts.map(d => [d.move_id, d]))

    const scored = moves.map(m => {
      const drill = drillMap.get(m.id)
      const drillCount = drill?.count || 0
      const lastDrilled = drill?.last_drilled_at ? new Date(drill.last_drilled_at).getTime() : 0
      const daysSince = lastDrilled ? (Date.now() - lastDrilled) / (1000 * 60 * 60 * 24) : 999

      // Higher score = more likely to be picked
      // Moves never drilled get highest priority, then by days since last drill
      const score = (daysSince * 10) + (1 / (drillCount + 1)) * 100 + Math.random() * 5
      return { move: m, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, targetCount).map(s => s.move)
  }, [drillCounts])

  // ---- Complete a practice session ----
  const completePracticeMutation = useMutation({
    mutationFn: async (input: { moveIds: string[]; durationSeconds?: number }) => {
      if (!uid) throw new Error('Must be signed in')

      // 1. Create the session
      const { data: session, error: sessionError } = await supabase
        .from('practice_sessions')
        .insert({
          user_id: uid,
          moves_drilled: input.moveIds,
          duration_seconds: input.durationSeconds || null,
          completed_at: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (sessionError) throw sessionError

      // 2. Log individual move drills
      if (input.moveIds.length > 0) {
        const drillRows = input.moveIds.map(move_id => ({
          user_id: uid,
          move_id,
          session_id: session.id,
          drilled_at: new Date().toISOString(),
        }))
        const { error: drillError } = await supabase
          .from('move_drills')
          .insert(drillRows)
        if (drillError) console.warn('[practice] drill log insert error (non-critical):', drillError)
      }

      return session as PracticeSession
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-sessions', uid] })
      queryClient.invalidateQueries({ queryKey: ['move-drills', uid] })
    },
  })

  // ---- Drill count for a specific move ----
  const getDrillCount = useCallback((moveId: string): MoveDrillCount | null => {
    return drillCounts.find(d => d.move_id === moveId) || null
  }, [drillCounts])

  return {
    // Goal
    goal,
    goalLoading,
    updateGoal: updateGoalMutation.mutateAsync,

    // Sessions & stats
    sessions,
    sessionsLoading,
    streak,
    daysThisWeek,
    practicedToday,
    totalSessions,
    totalMovesDrilled,

    // Per-move
    drillCounts,
    drillsLoading,
    getDrillCount,

    // Actions
    generatePracticeSet,
    completePractice: completePracticeMutation.mutateAsync,
    isCompleting: completePracticeMutation.isPending,

    // Loading
    isLoading: goalLoading || sessionsLoading || drillsLoading,
  }
}
