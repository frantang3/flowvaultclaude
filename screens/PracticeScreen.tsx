// screens/PracticeScreen.tsx
// Two-mode practice tab: Quick Shuffle (untracked) + Practice Session (tracked with streaks)
import React, { useMemo, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  ScrollView, Alert, Modal, Image, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import theme from '../lib/theme'
import { useAuthActions } from '../hooks/useAuth'
import { useMoves as useMovesQuery } from '../hooks/useMovesQuery'
import { usePractice } from '../hooks/usePractice'
import { saveRoutine } from '../lib/routines'
import { queryClient } from '../lib/queryClient'
import DraggableMoveList from '../components/DraggableMoveList'
import type { Move, Difficulty } from '../types/move'

// ---------- Helpers ----------

function shuffle<T>(arr: T[]): T[] {
  const next = arr.slice()
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

// ---------- Shared Sub-components ----------

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null
  return (
    <View style={styles.streakBadge}>
      <Text style={styles.streakEmoji}>🔥</Text>
      <Text style={styles.streakNumber}>{streak}</Text>
      <Text style={styles.streakLabel}>day streak</Text>
    </View>
  )
}

function WeekDots({ daysThisWeek, goal }: { daysThisWeek: number; goal: number }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <View style={styles.weekDotsRow}>
      {days.map((label, i) => {
        const filled = i < daysThisWeek
        const isGoal = i < goal
        return (
          <View key={i} style={styles.weekDotCol}>
            <View style={[
              styles.weekDot,
              isGoal && styles.weekDotGoal,
              filled && styles.weekDotFilled,
            ]}>
              {filled && (
                <MaterialCommunityIcons name="check" size={12} color={theme.colors.onPrimary} />
              )}
            </View>
            <Text style={[styles.weekDotLabel, filled && styles.weekDotLabelFilled]}>{label}</Text>
          </View>
        )
      })}
    </View>
  )
}

function StatCard({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <View style={styles.statCard}>
      <MaterialCommunityIcons name={icon as any} size={20} color={theme.colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function PracticeMoveItem({
  move, drillCount, isChecked, onToggle,
}: {
  move: Move; drillCount: number; isChecked: boolean; onToggle: () => void
}) {
  const hasThumb = move.thumbUrl || move.imageUrl
  return (
    <Pressable onPress={onToggle} style={[styles.moveItem, isChecked && styles.moveItemChecked]}>
      <View style={styles.moveItemLeft}>
        {hasThumb ? (
          <Image source={{ uri: (move.thumbUrl || move.imageUrl) as string }} style={styles.moveThumb} />
        ) : (
          <View style={[styles.moveThumb, styles.moveThumbPlaceholder]}>
            <MaterialCommunityIcons name="play-circle-outline" size={20} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
        <View style={styles.moveItemText}>
          <Text style={[styles.moveItemName, isChecked && styles.moveItemNameChecked]} numberOfLines={1}>
            {move.name}
          </Text>
          <View style={styles.moveItemMeta}>
            <Text style={styles.moveItemDifficulty}>{move.difficulty}</Text>
            {drillCount > 0 && (
              <Text style={styles.moveItemDrills}>
                {drillCount}× drilled
              </Text>
            )}
          </View>
        </View>
      </View>
      <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
        {isChecked && <MaterialCommunityIcons name="check" size={16} color={theme.colors.onPrimary} />}
      </View>
    </Pressable>
  )
}

// ---------- Mode Toggle ----------

function ModeToggle({ mode, onChangeMode }: { mode: 'shuffle' | 'session'; onChangeMode: (m: 'shuffle' | 'session') => void }) {
  return (
    <View style={styles.modeToggleContainer}>
      <Pressable
        onPress={() => onChangeMode('shuffle')}
        style={[styles.modeToggleButton, mode === 'shuffle' && styles.modeToggleButtonActive]}
      >
        <MaterialCommunityIcons
          name="shuffle-variant"
          size={16}
          color={mode === 'shuffle' ? theme.colors.onPrimary : theme.colors.muted}
        />
        <Text style={[styles.modeToggleText, mode === 'shuffle' && styles.modeToggleTextActive]}>
          Quick Shuffle
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChangeMode('session')}
        style={[styles.modeToggleButton, mode === 'session' && styles.modeToggleButtonActive]}
      >
        <MaterialCommunityIcons
          name="lightning-bolt"
          size={16}
          color={mode === 'session' ? theme.colors.onPrimary : theme.colors.muted}
        />
        <Text style={[styles.modeToggleText, mode === 'session' && styles.modeToggleTextActive]}>
          Practice Session
        </Text>
      </Pressable>
    </View>
  )
}

// ============================================================
// QUICK SHUFFLE MODE (original Randomizer features)
// ============================================================

function QuickShuffleMode({ moves, uid }: { moves: Move[]; uid: string | null }) {
  const [count, setCount] = useState(5)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [resultIds, setResultIds] = useState<string[]>([])
  const [collapsedMoves, setCollapsedMoves] = useState<Set<string>>(new Set())
  const [savingRoutine, setSavingRoutine] = useState(false)
  const [routineName, setRoutineName] = useState('')

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
    if (filteredPool.length === 0) {
      Alert.alert('No matching moves', 'Try changing your filters or add more moves to your library.')
      return
    }
    const pool = shuffle(filteredPool)
    const next = pool.slice(0, Math.max(0, Math.min(count, pool.length))).map((m: Move) => m.id)
    setResultIds(next)
    setCollapsedMoves(new Set(next))
  }

  const handleShuffleOrder = () => {
    setResultIds(shuffle(resultIds))
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev: string[]) =>
      prev.includes(tag) ? prev.filter((t: string) => t !== tag) : [...prev, tag]
    )
  }

  const handleSaveRoutine = async () => {
    if (!routineName.trim() || resultIds.length === 0) return
    setSavingRoutine(true)
    try {
      await saveRoutine({
        name: routineName.trim(),
        moves_order: resultIds,
      })
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      Alert.alert('Saved!', `"${routineName.trim()}" has been added to your routines.`)
      setRoutineName('')
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save routine.')
    } finally {
      setSavingRoutine(false)
    }
  }

  if (moves.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="shuffle-disabled" size={40} color={theme.colors.onSurfaceVariant} />
        <Text style={styles.emptyTitle}>No moves yet</Text>
        <Text style={styles.emptySubtitle}>Head to the Create tab to add your first moves, then come back here.</Text>
      </View>
    )
  }

  return (
    <>
      {/* Controls */}
      <View style={styles.controlsCard}>
        <Text style={styles.sectionTitle}>How many moves?</Text>
        <View style={styles.countPickerContainer}>
          <Text style={styles.countPickerValue}>{count}</Text>
          <View style={styles.countPickerRow}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const active = count === n
              return (
                <Pressable
                  key={n}
                  onPress={() => setCount(n)}
                  style={[styles.countPickerDot, active && styles.countPickerDotActive]}
                >
                  <Text style={[styles.countPickerDotText, active && styles.countPickerDotTextActive]}>{n}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Difficulty</Text>
        <View style={styles.filterRow}>
          <Pressable onPress={() => setDifficulty(null)} style={[styles.filterPill, difficulty === null && styles.filterPillActive]}>
            <Text style={[styles.filterPillText, difficulty === null && styles.filterPillTextActive]}>Any</Text>
          </Pressable>
          {(['Beginner', 'Intermediate', 'Advanced'] as Difficulty[]).map((d) => {
            const active = difficulty === d
            return (
              <Pressable key={d} onPress={() => setDifficulty(d)} style={[styles.filterPill, active && styles.filterPillActive]}>
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{d}</Text>
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

        <Pressable onPress={run} disabled={filteredPool.length === 0} style={[styles.generateButton, filteredPool.length === 0 && { opacity: 0.5 }]}>
          <MaterialCommunityIcons name="shuffle-variant" size={18} color={theme.colors.onPrimary} />
          <Text style={styles.generateButtonText}>Generate set</Text>
        </Pressable>

        <Text style={styles.poolHint}>Pool: {filteredPool.length} moves</Text>
      </View>

      {/* Results */}
      {results.length > 0 ? (
        <>
          <View style={styles.resultsHeaderRow}>
            <Text style={styles.sectionTitle}>Your set ({results.length} moves)</Text>
            <Pressable onPress={handleShuffleOrder} style={styles.reshuffleButton}>
              <MaterialCommunityIcons name="shuffle-variant" size={16} color={theme.colors.primary} />
              <Text style={styles.reshuffleText}>Shuffle</Text>
            </Pressable>
          </View>

          <Text style={styles.reorderHint}>Long press and drag to reorder</Text>

          <DraggableMoveList
            moves={results}
            onReorder={(reordered: Move[]) => setResultIds(reordered.map((m: Move) => m.id))}
          />

          {/* Save as routine */}
          <View style={styles.saveRoutineCard}>
            <Text style={styles.sectionTitle}>Save as routine</Text>
            <TextInput
              value={routineName}
              onChangeText={setRoutineName}
              placeholder="Routine name (e.g. Morning Flow)"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              style={styles.routineNameInput}
            />
            <Pressable
              onPress={handleSaveRoutine}
              disabled={!routineName.trim() || savingRoutine}
              style={[styles.saveRoutineButton, (!routineName.trim() || savingRoutine) && { opacity: 0.6 }]}
            >
              {savingRoutine ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.saveRoutineButtonText}>Save routine</Text>
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
    </>
  )
}

// ============================================================
// PRACTICE SESSION MODE (tracked drills with streaks)
// ============================================================

function PracticeSessionMode({ moves, uid }: { moves: Move[]; uid: string | null }) {
  const {
    goal, updateGoal, goalLoading,
    streak, daysThisWeek, practicedToday, totalSessions, totalMovesDrilled,
    generatePracticeSet, completePractice, isCompleting,
    getDrillCount, isLoading: practiceLoading,
  } = usePractice(uid)

  const [practiceSet, setPracticeSet] = useState<Move[]>([])
  const [checkedMoveIds, setCheckedMoveIds] = useState<Set<string>>(new Set())
  const [sessionComplete, setSessionComplete] = useState(false)
  const [goalModalVisible, setGoalModalVisible] = useState(false)
  const [tempDaysPerWeek, setTempDaysPerWeek] = useState(3)
  const [tempMovesPerSession, setTempMovesPerSession] = useState(5)
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | null>(null)

  const currentGoalDays = goal?.days_per_week || 3
  const currentGoalMoves = goal?.moves_per_session || 5
  const allChecked = practiceSet.length > 0 && checkedMoveIds.size === practiceSet.length

  const movePool = useMemo(() => {
    if (!difficultyFilter) return moves
    return moves.filter((m: Move) => m.difficulty === difficultyFilter)
  }, [moves, difficultyFilter])

  const handleGenerate = useCallback(() => {
    const set = generatePracticeSet(movePool, currentGoalMoves)
    setPracticeSet(set)
    setCheckedMoveIds(new Set())
    setSessionComplete(false)
  }, [generatePracticeSet, movePool, currentGoalMoves])

  const toggleMove = useCallback((id: string) => {
    setCheckedMoveIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleComplete = useCallback(async () => {
    if (checkedMoveIds.size === 0) {
      Alert.alert('No moves checked', 'Check off the moves you practiced before completing.')
      return
    }
    try {
      await completePractice({ moveIds: Array.from(checkedMoveIds) })
      setSessionComplete(true)
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save practice session.')
    }
  }, [checkedMoveIds, completePractice])

  const handleSaveGoal = useCallback(async () => {
    try {
      await updateGoal({ days_per_week: tempDaysPerWeek, moves_per_session: tempMovesPerSession })
      setGoalModalVisible(false)
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save goal.')
    }
  }, [tempDaysPerWeek, tempMovesPerSession, updateGoal])

  const openGoalModal = useCallback(() => {
    setTempDaysPerWeek(currentGoalDays)
    setTempMovesPerSession(currentGoalMoves)
    setGoalModalVisible(true)
  }, [currentGoalDays, currentGoalMoves])

  if (practiceLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your practice...</Text>
      </View>
    )
  }

  return (
    <>
      {/* Header stats row */}
      <View style={styles.sessionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sessionSubtitle}>
            {practicedToday
              ? 'You already drilled today. Go again?'
              : 'Time to move. Let\'s build your set.'}
          </Text>
        </View>
        <StreakBadge streak={streak} />
      </View>

      {/* Week progress + goal */}
      <View style={styles.weekCard}>
        <View style={styles.weekCardHeader}>
          <Text style={styles.weekCardTitle}>This week</Text>
          <Pressable onPress={openGoalModal} style={styles.goalButton}>
            <MaterialCommunityIcons name="target" size={14} color={theme.colors.primary} />
            <Text style={styles.goalButtonText}>{currentGoalDays}×/week</Text>
          </Pressable>
        </View>
        <WeekDots daysThisWeek={daysThisWeek} goal={currentGoalDays} />
        <Text style={styles.weekProgress}>
          {daysThisWeek}/{currentGoalDays} days complete
          {daysThisWeek >= currentGoalDays ? ' — goal hit! 🎉' : ''}
        </Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatCard icon="counter" value={totalSessions} label="Sessions" />
        <StatCard icon="lightning-bolt" value={totalMovesDrilled} label="Drills" />
        <StatCard icon="fire" value={streak} label="Streak" />
      </View>

      {/* Practice set area */}
      {practiceSet.length === 0 && !sessionComplete ? (
        <View style={styles.generateCard}>
          <MaterialCommunityIcons name="lightning-bolt" size={40} color={theme.colors.primary} style={{ marginBottom: 12 }} />
          <Text style={styles.generateTitle}>
            {moves.length === 0 ? 'Add some moves first' : 'Ready to practice?'}
          </Text>
          <Text style={styles.generateSubtitle}>
            {moves.length === 0
              ? 'Head to the Create tab to add your first moves, then come back here.'
              : `We'll pick ${currentGoalMoves} moves from your library${difficultyFilter ? ` (${difficultyFilter})` : ''}, weighted toward ones you haven't drilled recently.`}
          </Text>

          {moves.length > 0 && (
            <View style={styles.filterRow}>
              {([null, 'Beginner', 'Intermediate', 'Advanced'] as (Difficulty | null)[]).map((d) => {
                const active = difficultyFilter === d
                return (
                  <Pressable
                    key={d || 'any'}
                    onPress={() => setDifficultyFilter(d)}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {d || 'Any'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}

          {moves.length > 0 && (
            <Pressable onPress={handleGenerate} style={styles.generateButton}>
              <MaterialCommunityIcons name="play" size={18} color={theme.colors.onPrimary} />
              <Text style={styles.generateButtonText}>Generate today's set</Text>
            </Pressable>
          )}

          <Text style={styles.poolHint}>{movePool.length} moves in pool</Text>
        </View>
      ) : sessionComplete ? (
        <View style={styles.completeCard}>
          <Text style={styles.completeEmoji}>🎉</Text>
          <Text style={styles.completeTitle}>Session complete!</Text>
          <Text style={styles.completeSubtitle}>
            You drilled {checkedMoveIds.size} move{checkedMoveIds.size !== 1 ? 's' : ''}.
            {streak > 1 ? ` ${streak}-day streak going strong.` : ''}
          </Text>
          <Pressable onPress={() => { setPracticeSet([]); setSessionComplete(false) }} style={styles.generateButton}>
            <MaterialCommunityIcons name="refresh" size={18} color={theme.colors.onPrimary} />
            <Text style={styles.generateButtonText}>Practice again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.setContainer}>
          <View style={styles.setHeaderRow}>
            <Text style={styles.setSectionTitle}>Today's set</Text>
            <Pressable onPress={handleGenerate} style={styles.reshuffleButton}>
              <MaterialCommunityIcons name="shuffle-variant" size={16} color={theme.colors.primary} />
              <Text style={styles.reshuffleText}>Reshuffle</Text>
            </Pressable>
          </View>

          <Text style={styles.setHint}>Check off each move as you drill it</Text>

          {practiceSet.map((move) => {
            const drill = getDrillCount(move.id)
            return (
              <PracticeMoveItem
                key={move.id}
                move={move}
                drillCount={drill?.count || 0}
                isChecked={checkedMoveIds.has(move.id)}
                onToggle={() => toggleMove(move.id)}
              />
            )
          })}

          <Pressable
            onPress={handleComplete}
            disabled={isCompleting || checkedMoveIds.size === 0}
            style={[
              styles.completeButton,
              (isCompleting || checkedMoveIds.size === 0) && styles.completeButtonDisabled,
            ]}
          >
            {isCompleting ? (
              <ActivityIndicator color={theme.colors.onPrimary} />
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.onPrimary} />
                <Text style={styles.completeButtonText}>
                  {allChecked ? 'Complete session' : `Done (${checkedMoveIds.size}/${practiceSet.length})`}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {/* Goal settings modal */}
      <Modal visible={goalModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Practice goal</Text>
            <Text style={styles.modalSubtitle}>How often do you want to practice?</Text>

            <Text style={styles.modalLabel}>Days per week</Text>
            <View style={styles.pickerRow}>
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <Pressable key={n} onPress={() => setTempDaysPerWeek(n)}
                  style={[styles.pickerDot, tempDaysPerWeek === n && styles.pickerDotActive]}>
                  <Text style={[styles.pickerDotText, tempDaysPerWeek === n && styles.pickerDotTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.modalLabel, { marginTop: 20 }]}>Moves per session</Text>
            <View style={styles.pickerRow}>
              {[3, 4, 5, 6, 7, 8, 10].map(n => (
                <Pressable key={n} onPress={() => setTempMovesPerSession(n)}
                  style={[styles.pickerDot, tempMovesPerSession === n && styles.pickerDotActive]}>
                  <Text style={[styles.pickerDotText, tempMovesPerSession === n && styles.pickerDotTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <Pressable onPress={() => setGoalModalVisible(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSaveGoal} style={styles.modalSave}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

// ============================================================
// MAIN SCREEN
// ============================================================

export default function PracticeScreen() {
  const { uid } = useAuthActions()
  const { moves, isLoading: movesLoading } = useMovesQuery(uid)
  const [mode, setMode] = useState<'shuffle' | 'session'>('session')

  if (movesLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Practice</Text>
        </View>

        <ModeToggle mode={mode} onChangeMode={setMode} />

        {mode === 'shuffle' ? (
          <QuickShuffleMode moves={moves} uid={uid} />
        ) : (
          <PracticeSessionMode moves={moves} uid={uid} />
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: theme.colors.muted, ...theme.fonts.body },

  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  title: { fontSize: theme.type.h2, color: theme.colors.text, ...theme.fonts.heading },

  // Mode toggle
  modeToggleContainer: {
    flexDirection: 'row', marginHorizontal: theme.spacing.md,
    marginTop: 8, marginBottom: 12,
    backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radii.md, padding: 4,
  },
  modeToggleButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: theme.radii.sm,
  },
  modeToggleButtonActive: { backgroundColor: theme.colors.primary },
  modeToggleText: { fontSize: 13, color: theme.colors.muted, ...theme.fonts.bodySemiBold },
  modeToggleTextActive: { color: theme.colors.onPrimary },

  // Session header
  sessionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm,
  },
  sessionSubtitle: { marginTop: 4, color: theme.colors.muted, fontSize: 14, ...theme.fonts.body },

  // Streak badge
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF3E0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  streakEmoji: { fontSize: 16 },
  streakNumber: { fontSize: 18, color: '#E65100', ...theme.fonts.heading },
  streakLabel: { fontSize: 12, color: '#E65100', ...theme.fonts.body },

  // Week card
  weekCard: {
    marginHorizontal: theme.spacing.md, marginTop: 4, padding: 16,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.md,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  weekCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  weekCardTitle: { fontSize: 15, color: theme.colors.text, ...theme.fonts.headingSemiBold },
  goalButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: theme.colors.primary + '14',
  },
  goalButtonText: { fontSize: 12, color: theme.colors.primary, ...theme.fonts.bodySemiBold },
  weekDotsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  weekDotCol: { alignItems: 'center', gap: 4 },
  weekDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.colors.surfaceVariant, alignItems: 'center', justifyContent: 'center',
  },
  weekDotGoal: { borderWidth: 2, borderColor: theme.colors.primary + '40' },
  weekDotFilled: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  weekDotLabel: { fontSize: 10, color: theme.colors.onSurfaceVariant, ...theme.fonts.body },
  weekDotLabelFilled: { color: theme.colors.primary, ...theme.fonts.bodySemiBold },
  weekProgress: { marginTop: 12, textAlign: 'center', fontSize: 13, color: theme.colors.muted, ...theme.fonts.body },

  // Stats row
  statsRow: { flexDirection: 'row', paddingHorizontal: theme.spacing.md, gap: 10, marginTop: 12 },
  statCard: {
    flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radii.md,
    padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: theme.colors.outline,
  },
  statValue: { fontSize: 20, color: theme.colors.text, ...theme.fonts.heading },
  statLabel: { fontSize: 11, color: theme.colors.muted, ...theme.fonts.body },

  // Generate card
  generateCard: {
    marginHorizontal: theme.spacing.md, marginTop: 20, padding: 24,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    borderWidth: 1, borderColor: theme.colors.outline, alignItems: 'center',
  },
  generateTitle: { fontSize: 17, color: theme.colors.text, textAlign: 'center', ...theme.fonts.heading },
  generateSubtitle: { marginTop: 8, fontSize: 14, color: theme.colors.muted, textAlign: 'center', lineHeight: 20, ...theme.fonts.body },

  // Filter pills (shared)
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant },
  filterPillActive: { backgroundColor: theme.colors.primary },
  filterPillText: { fontSize: 13, color: theme.colors.text, ...theme.fonts.bodySemiBold },
  filterPillTextActive: { color: theme.colors.onPrimary },

  // Generate button (shared)
  generateButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, backgroundColor: theme.colors.primary,
    paddingVertical: 14, paddingHorizontal: 24, borderRadius: theme.radii.md, width: '100%',
  },
  generateButtonText: { color: theme.colors.onPrimary, fontSize: 15, ...theme.fonts.headingSemiBold },
  poolHint: { marginTop: 10, fontSize: 12, color: theme.colors.onSurfaceVariant, ...theme.fonts.body },

  // Set headers
  setContainer: { marginHorizontal: theme.spacing.md, marginTop: 20 },
  setHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  setSectionTitle: { fontSize: 16, color: theme.colors.text, ...theme.fonts.heading },
  resultsHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md, paddingTop: 16, paddingBottom: 4,
  },
  reshuffleButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primary + '14',
  },
  reshuffleText: { fontSize: 13, color: theme.colors.primary, ...theme.fonts.bodySemiBold },
  setHint: { fontSize: 12, color: theme.colors.muted, marginBottom: 12, ...theme.fonts.body },
  reorderHint: {
    paddingHorizontal: theme.spacing.md, paddingBottom: 8,
    color: theme.colors.muted, fontSize: 12, fontStyle: 'italic', ...theme.fonts.body,
  },

  // Practice move items
  moveItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.md,
    borderWidth: 1, borderColor: theme.colors.outline, padding: 12, marginBottom: 8,
  },
  moveItemChecked: { backgroundColor: theme.colors.primary + '08', borderColor: theme.colors.primary + '30' },
  moveItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  moveThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: theme.colors.surfaceVariant },
  moveThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  moveItemText: { flex: 1 },
  moveItemName: { fontSize: 15, color: theme.colors.text, ...theme.fonts.headingSemiBold },
  moveItemNameChecked: { textDecorationLine: 'line-through', color: theme.colors.muted },
  moveItemMeta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  moveItemDifficulty: { fontSize: 12, color: theme.colors.onSurfaceVariant, ...theme.fonts.body },
  moveItemDrills: { fontSize: 12, color: theme.colors.primary, ...theme.fonts.bodySemiBold },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: theme.colors.outline, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },

  // Complete button
  completeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, backgroundColor: theme.colors.success, paddingVertical: 14, borderRadius: theme.radii.md,
  },
  completeButtonDisabled: { opacity: 0.5 },
  completeButtonText: { color: theme.colors.onPrimary, fontSize: 15, ...theme.fonts.headingSemiBold },

  // Session complete card
  completeCard: {
    marginHorizontal: theme.spacing.md, marginTop: 20, padding: 32,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    borderWidth: 1, borderColor: theme.colors.success + '40', alignItems: 'center',
  },
  completeEmoji: { fontSize: 48, marginBottom: 8 },
  completeTitle: { fontSize: 20, color: theme.colors.text, ...theme.fonts.heading },
  completeSubtitle: { marginTop: 8, fontSize: 14, color: theme.colors.muted, textAlign: 'center', lineHeight: 20, ...theme.fonts.body },

  // Quick shuffle: controls card
  controlsCard: {
    marginHorizontal: theme.spacing.md, marginTop: 4, padding: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1,
    borderColor: theme.colors.outline, borderRadius: theme.radii.md,
  },
  sectionTitle: { color: theme.colors.text, ...theme.fonts.heading },
  countPickerContainer: { marginTop: 10 },
  countPickerValue: { fontSize: 24, color: theme.colors.primary, textAlign: 'center', marginBottom: 10, ...theme.fonts.heading },
  countPickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  countPickerDot: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.surfaceVariant, alignItems: 'center', justifyContent: 'center',
  },
  countPickerDotActive: { backgroundColor: theme.colors.primary },
  countPickerDotText: { fontSize: 12, color: theme.colors.text, ...theme.fonts.bodyBold },
  countPickerDotTextActive: { color: theme.colors.onPrimary },

  // Quick shuffle: tags
  tagsScrollContent: { flexDirection: 'row', gap: 8, marginTop: 10, paddingRight: theme.spacing.md },
  tagChip: {
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.outline, borderRadius: 20,
  },
  tagChipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tagChipText: { fontSize: 13, color: theme.colors.text, ...theme.fonts.bodySemiBold },
  tagChipTextSelected: { color: theme.colors.onPrimary },

  // Quick shuffle: save routine
  saveRoutineCard: {
    marginHorizontal: theme.spacing.md, marginTop: 16, padding: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1,
    borderColor: theme.colors.outline, borderRadius: theme.radii.md,
  },
  routineNameInput: {
    marginTop: 10, backgroundColor: theme.colors.surfaceVariant,
    borderRadius: theme.radii.md, padding: 12, color: theme.colors.text, ...theme.fonts.body,
  },
  saveRoutineButton: {
    marginTop: 12, backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md, paddingVertical: 12, alignItems: 'center',
  },
  saveRoutineButtonText: { color: theme.colors.onPrimary, ...theme.fonts.headingSemiBold },

  // Empty state
  empty: { marginTop: 40, alignItems: 'center', paddingHorizontal: theme.spacing.lg },
  emptyTitle: { fontSize: 16, color: theme.colors.text, marginTop: 12, ...theme.fonts.heading },
  emptySubtitle: { marginTop: 6, textAlign: 'center', color: theme.colors.muted, lineHeight: 20, ...theme.fonts.body },

  // Goal modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, color: theme.colors.text, ...theme.fonts.heading },
  modalSubtitle: { marginTop: 4, fontSize: 14, color: theme.colors.muted, marginBottom: 20, ...theme.fonts.body },
  modalLabel: { fontSize: 14, color: theme.colors.text, marginBottom: 10, ...theme.fonts.headingSemiBold },
  pickerRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  pickerDot: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.surfaceVariant, alignItems: 'center', justifyContent: 'center',
  },
  pickerDotActive: { backgroundColor: theme.colors.primary },
  pickerDotText: { fontSize: 15, color: theme.colors.text, ...theme.fonts.bodySemiBold },
  pickerDotTextActive: { color: theme.colors.onPrimary },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 28 },
  modalCancel: {
    flex: 1, paddingVertical: 14, borderRadius: theme.radii.md,
    borderWidth: 1, borderColor: theme.colors.outline, alignItems: 'center',
  },
  modalCancelText: { color: theme.colors.text, ...theme.fonts.bodySemiBold },
  modalSave: { flex: 1, paddingVertical: 14, borderRadius: theme.radii.md, backgroundColor: theme.colors.primary, alignItems: 'center' },
  modalSaveText: { color: theme.colors.onPrimary, ...theme.fonts.headingSemiBold },
})
