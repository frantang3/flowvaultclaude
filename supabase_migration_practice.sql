-- ============================================
-- MIGRATION: Practice Tracking
-- Run this in your Supabase SQL Editor
-- ============================================

-- Practice goals: how many days per week the user wants to practice
CREATE TABLE IF NOT EXISTS public.practice_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() UNIQUE, -- one row per user
  days_per_week INT NOT NULL DEFAULT 3 CHECK (days_per_week >= 1 AND days_per_week <= 7),
  moves_per_session INT NOT NULL DEFAULT 5 CHECK (moves_per_session >= 1 AND moves_per_session <= 20),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.practice_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_owns_practice_goals"
  ON public.practice_goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Practice sessions: each time a user completes a practice
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moves_drilled UUID[] NOT NULL DEFAULT '{}', -- which move IDs were in this session
  duration_seconds INT, -- optional: how long the session took
  notes TEXT
);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_owns_practice_sessions"
  ON public.practice_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Move drill log: per-move tracking (how many times each move has been practiced)
CREATE TABLE IF NOT EXISTS public.move_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  move_id UUID NOT NULL REFERENCES public.moves(id) ON DELETE CASCADE,
  drilled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id UUID REFERENCES public.practice_sessions(id) ON DELETE SET NULL
);

ALTER TABLE public.move_drills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_owns_move_drills"
  ON public.move_drills
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_completed
  ON public.practice_sessions (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_move_drills_user_move
  ON public.move_drills (user_id, move_id, drilled_at DESC);

CREATE INDEX IF NOT EXISTS idx_move_drills_session
  ON public.move_drills (session_id);
