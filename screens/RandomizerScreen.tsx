import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, ScrollView, TextInput, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import DraggableFlatList from 'react-native-draggable-flatlist'
import theme from '../lib/theme'
import { useAuthActions } from '../hooks/useAuth'
import { useMoves as useMovesQuery } from '../hooks/useMovesQuery'
import { saveRoutine } from '../lib/routines'
import MoveCard from '../components/MoveCard'
import { Move } from '../types/move'

type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'

function shuffle<T>(arr: T[]) {
  const next = arr.slice()
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export default function RandomizerScreen() {
  const { uid } = useAuthActions()
  const { moves, isLoading } = useMovesQuery(uid)

  const [count, setCount] = useState(5)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [resultIds, setResultIds] = useState<string[]>([])
  const [collapsedMoves, setCollapsedMoves] = useState<Set<string>>(new Set())

  const [savingRoutine, setSavingRoutine] = useState(false)
  const [routineName, setRoutineName] = useState('')

  // Extract all unique tags from moves
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>()
    moves.forEach((m: Move) => m.tags.forEach((t: string) => tagsSet.add(t)))
    return Array.from(tagsSet).sort()
  }, [moves])

  const filteredPool = useMemo(() => {
    let pool = moves
    if (difficulty) pool = pool.filter((m: Move) => m.difficulty === difficulty)
    if (selectedTags.length > 0) {
      pool = pool.filter((m: Move) => selectedTags.every((tag: string) => m.tags.includes(tag)))
    }
    return pool
  }, [difficulty, moves, selectedTags])

  const results = useMemo(() => {
    const map = new Map(moves.map((m: Move) => [m.id, m]))
    return resultIds.map((id: string) => map.get(id)).filter(Boolean) as Move[]
  }, [moves, resultIds])

  const run = () => {
    const pool = shuffle(filteredPool)
    const next = pool.slice(0, Math.max(0, Math.min(count, pool.length))).map((m: Move) => m.id)
    setResultIds(next)
    // Collapse all cards by default when generating
    setCollapsedMoves(new Set(next))
  }

  const handleShuffle = () => {
    setResultIds(shuffle(resultIds))
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev: string[]) =>
      prev.includes(tag) ? prev.filter((t: string) => t !== tag) : [...prev, tag]
    )
  }

  const toggleCollapse = (id: string) => {
    setCollapsedMoves((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  type DragItemArgs = { item: Move; drag: () => void; isActive: boolean }

  const renderItem = ({ item, drag, isActive }: DragItemArgs) => {
    const isCollapsed = collapsedMoves.has(item.id)
    return (
      <View style={[styles.draggableItem, isActive && styles.draggableItemActive]}>
        <Pressable 
          onLongPress={drag} 
          hitSlop={10}
          style={styles.dragHandleContainer}
        >
          <MaterialCommunityIcons name="drag-vertical" size={24} color={theme.colors.muted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <MoveCard
            move={item}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapse(item.id)}
          />
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Randomizer</Text>
          <Text style={styles.subtitle}>Instant practice set — no overthinking.</Text>
        </View>

        <View style={styles.controlsCard}>
          <Text style={styles.sectionTitle}>How many moves?</Text>
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderValue}>{count}</Text>
            <View style={styles.sliderTrack}>
              {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                const active = count === n
                return (
                  <Pressable
                    key={n}
                    onPress={() => setCount(n)}
                    style={[styles.sliderDot, active && styles.sliderDotActive]}
                  >
                    <Text style={[styles.sliderDotText, active && styles.sliderDotTextActive]}>{n}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Difficulty</Text>
          <View style={styles.countRow}>
            <Pressable onPress={() => setDifficulty(null)} style={[styles.pill, difficulty === null && styles.pillActive]}>
              <Text style={[styles.pillText, difficulty === null && styles.pillTextActive]}>Any</Text>
            </Pressable>
            {(['Beginner', 'Intermediate', 'Advanced'] as Difficulty[]).map((d) => {
              const active = difficulty === d
              return (
                <Pressable key={d} onPress={() => setDifficulty(d)} style={[styles.pill, active && styles.pillActive]}>
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{d}</Text>
                </Pressable>
              )
            })}
          </View>

          {allTags.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Include tags</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsScrollContent}>
                {allTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag)
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => toggleTag(tag)}
                      style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                    >
                      <Text style={[styles.tagChipText, isSelected && styles.tagChipTextSelected]}>
                        {tag}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </>
          )}

          <Pressable onPress={run} style={styles.primaryButton}>
            <MaterialCommunityIcons name="shuffle-variant" size={18} color={theme.colors.onPrimary} />
            <Text style={styles.primaryButtonText}>Generate set</Text>
          </Pressable>

          <Text style={styles.metaHint}>
            Pool: {filteredPool.length} moves
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : results.length > 0 ? (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.sectionTitle}>Your set ({results.length} moves)</Text>
              <Pressable onPress={handleShuffle} style={styles.shuffleButton}>
                <MaterialCommunityIcons name="shuffle-variant" size={18} color={theme.colors.primary} />
                <Text style={styles.shuffleButtonText}>Shuffle</Text>
              </Pressable>
            </View>

            <Text style={styles.reorderHint}>Long press and drag to reorder</Text>

            <DraggableFlatList
              data={results}
              keyExtractor={(m) => m.id}
              onDragEnd={({ data }: { data: Move[] }) => setResultIds(data.map((m: Move) => m.id))}
              renderItem={renderItem}
              scrollEnabled={false}
              containerStyle={{ paddingHorizontal: theme.spacing.md }}
            />

            <View style={styles.saveRoutineCard}>
              <Text style={styles.sectionTitle}>Save as routine</Text>
              <TextInput
                value={routineName}
                onChangeText={setRoutineName}
                placeholder="Routine name (e.g. Morning Flow)"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                style={styles.input}
              />
              <Pressable
                onPress={handleSaveRoutine}
                disabled={!routineName.trim() || savingRoutine}
                style={[styles.saveButton, (!routineName.trim() || savingRoutine) && { opacity: 0.6 }]}
              >
                {savingRoutine ? (
                  <ActivityIndicator color={theme.colors.onPrimary} />
                ) : (
                  <Text style={styles.saveButtonText}>Save routine</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing yet</Text>
            <Text style={styles.emptySubtitle}>Tap "Generate set" to pull a random list.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  title: { fontSize: theme.type.h2, fontWeight: '900', color: theme.colors.text },
  subtitle: { marginTop: 4, color: theme.colors.muted },
  controlsCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: 10,
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: theme.radii.md,
  },
  sectionTitle: { fontWeight: '900', color: theme.colors.text },
  sliderContainer: {
    marginTop: 10,
  },
  sliderValue: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  sliderTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderDotActive: {
    backgroundColor: theme.colors.primary,
  },
  sliderDotText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
  },
  sliderDotTextActive: {
    color: theme.colors.onPrimary,
  },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceVariant,
  },
  pillActive: { backgroundColor: theme.colors.primary },
  pillText: { color: theme.colors.text, fontWeight: '800', fontSize: 12 },
  pillTextActive: { color: theme.colors.onPrimary },
  tagsScrollContent: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingRight: theme.spacing.md,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 20,
  },
  tagChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  tagChipTextSelected: {
    color: theme.colors.onPrimary,
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: { color: theme.colors.onPrimary, fontWeight: '900' },
  metaHint: { marginTop: 10, color: theme.colors.muted, fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 16,
    paddingBottom: 4,
  },
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.primary + '18',
    borderRadius: theme.radii.md,
  },
  shuffleButtonText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  reorderHint: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 8,
    color: theme.colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  draggableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  draggableItemActive: {
    backgroundColor: theme.colors.primary + '08',
    borderColor: theme.colors.primary,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dragHandleContainer: {
    paddingLeft: 8,
    paddingVertical: 12,
  },
  saveRoutineCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: 16,
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: theme.radii.md,
  },
  input: {
    marginTop: 10,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: theme.radii.md,
    padding: 12,
    color: theme.colors.text,
  },
  saveButton: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: theme.colors.onPrimary,
    fontWeight: '900',
  },
  empty: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  emptySubtitle: { marginTop: 6, textAlign: 'center', color: theme.colors.muted, lineHeight: 20 },
})
