-- Supabase schema for Flowvault
-- Run this in your Supabase SQL editor to set up the backend

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create the moves table
CREATE TABLE IF NOT EXISTS public.moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  video_url TEXT,  -- deprecated: use video_url_original or video_url_web
  video_url_original TEXT,  -- original uploaded video (MOV/MP4)
  video_url_web TEXT,  -- web-optimized transcode (future use)
  image_url TEXT,
  thumb_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;

-- Single policy covering all operations (select, insert, update, delete)
CREATE POLICY "user_owns_moves"
  ON public.moves
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create the routines table
CREATE TABLE IF NOT EXISTS public.routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  description TEXT,
  difficulty TEXT CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
  tags TEXT[] DEFAULT '{}',
  moves_order UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security for routines
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

-- RLS policy for routines
CREATE POLICY "user_owns_routines"
  ON public.routines
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket 'moves' setup instructions:
-- 1. Create a bucket named 'moves' in Supabase Storage UI
-- 2. Set it to public: true (allows public read access)
-- 3. Set file_size_limit to 104857600 (100 MB)
-- 4. Then run the storage policies below

-- Storage policy: Public read access to all objects in 'moves' bucket
CREATE POLICY "public_read_moves"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'moves');

-- Storage policy: Authenticated users can insert/update/delete only their own files
-- Files must be under moves/{user_id}/... path
CREATE POLICY "user_write_own"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'moves' AND
    (POSITION(auth.uid()::text || '/' IN name) = 1)
  )
  WITH CHECK (
    bucket_id = 'moves' AND
    (POSITION(auth.uid()::text || '/' IN name) = 1)
  );

-- Update storage bucket to allow video uploads (run this in Supabase SQL Editor)
UPDATE storage.buckets
SET allowed_mime_types = '{image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm}'::text[],
    file_size_limit = 104857600  -- 100 MB
WHERE id = 'moves';

-- ============================================
-- MIGRATION: Add thumb_url column (if upgrading from earlier version)
-- ============================================
-- Run this if you already have a moves table without thumb_url:
-- ALTER TABLE public.moves ADD COLUMN IF NOT EXISTS thumb_url TEXT;

-- ============================================
-- MIGRATION: Add video_url_original and video_url_web columns
-- ============================================
-- Run this if you already have a moves table without these columns:
-- ALTER TABLE public.moves ADD COLUMN IF NOT EXISTS video_url_original TEXT;
-- ALTER TABLE public.moves ADD COLUMN IF NOT EXISTS video_url_web TEXT;