// types/move.ts
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'

export type Move = {
  id: string
  name: string
  difficulty: Difficulty
  tags: string[]
  notes?: string
  videoUrl?: string | null  // deprecated: use videoUrlOriginal
  videoUrlOriginal?: string | null  // original uploaded video (MOV/MP4)
  videoUrlWeb?: string | null  // web-optimized transcode (future use)
  imageUrl?: string | null
  thumbUrl?: string | null  // Thumbnail URL for video preview
  createdAt: string // ISO timestamp
}

export type Routine = {
  id: string
  name: string
  description?: string
  difficulty?: Difficulty
  tags?: string[]
  moveIds: string[]
  createdAt: string
}