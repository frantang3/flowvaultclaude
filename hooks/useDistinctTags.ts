// hooks/useDistinctTags.ts
import { useMemo } from 'react'
import { useMoves } from './useMovesQuery'

export type TagWithFrequency = {
  tag: string
  frequency: number
}

export function useDistinctTags(uid: string | null | undefined) {
  const { moves } = useMoves(uid)

  const tagsWithFrequency = useMemo((): TagWithFrequency[] => {
    const tagFrequency = new Map<string, number>()
    
    moves.forEach(move => {
      move.tags.forEach(tag => {
        const normalized = tag.toLowerCase().trim()
        if (!normalized) return
        
        // Find the original casing (first occurrence)
        let originalTag = tag
        for (const [existingTag] of tagFrequency) {
          if (existingTag.toLowerCase() === normalized) {
            originalTag = existingTag
            break
          }
        }
        
        tagFrequency.set(originalTag, (tagFrequency.get(originalTag) || 0) + 1)
      })
    })

    return Array.from(tagFrequency.entries())
      .map(([tag, frequency]) => ({ tag, frequency }))
      .sort((a, b) => {
        if (b.frequency !== a.frequency) return b.frequency - a.frequency
        return a.tag.localeCompare(b.tag)
      })
  }, [moves])

  const distinctTags = useMemo(() => tagsWithFrequency.map(t => t.tag), [tagsWithFrequency])

  return {
    distinctTags,
    tagsWithFrequency,
  }
}