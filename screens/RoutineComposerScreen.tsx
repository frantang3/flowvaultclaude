import React, { useMemo, useState, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, ActivityIndicator, ScrollView, Modal, Platform, ActionSheetIOS } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import theme from '../lib/theme'
import { useAuthActions } from '../hooks/useAuth'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useMoves as useMovesQuery } from '../hooks/useMovesQuery'
import { useRoutines } from '../hooks/useRoutinesQuery'
import { saveRoutine, updateRoutineRow, deleteRoutineRow } from '../lib/routines'
import type { Move, Difficulty as MoveDifficulty } from '../types/move'
import type { RoutineRow } from '../lib/routines'

type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'

export default function RoutineComposerScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const routineId: string | undefined = route?.params?.routineId

  const { uid } = useAuthActions()
  const { moves, isLoading: movesLoading } = useMovesQuery(uid)
  const { routines, isLoading: routinesLoading, refetch: refetchRoutines } = useRoutines(uid)

  const [name, setName] = useState('')
  const [selectedMoveIds, setSelectedMoveIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [modalVisible, setModalVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null)

  const editingRoutine = useMemo((): RoutineRow | null => {
    if (!routineId) return null
    return routines.find((r: RoutineRow) => r.id === routineId) || null
  }, [routineId, routines])

  useEffect(() => {
    if (!editingRoutine) return
    setName(editingRoutine.name || '')
    setSelectedMoveIds(editingRoutine.moves_order || [])
  }, [editingRoutine])

  const clearEditing = () => {
    navigation.setParams({ routineId: undefined })
    setName('')
    setSelectedMoveIds([])
  }

  // Extract unique tags and difficulties
  const { allTags, allDifficulties } = useMemo(() => {
    const tagsSet = new Set<string>()
    const difficultiesSet = new Set<string>()

    moves.forEach((m: Move) => {
      if (m.difficulty) difficultiesSet.add(m.difficulty)
      if (m.tags) m.tags.forEach((t: string) => tagsSet.add(t))
    })

    return {
      allTags: Array.from(tagsSet).sort(),
      allDifficulties: Array.from(difficultiesSet).sort(),
    }
  }, [moves])

  // Filter moves based on search query, tags, and difficulty
  const filteredMoves = useMemo(() => {
    let filtered = moves

    // Text search
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      filtered = filtered.filter((m: Move) => {
        const nameHit = (m.name || '').toLowerCase().includes(q)
        const tagHit = (m.tags || []).some((t) => String(t || '').toLowerCase().includes(q))
        const notesHit = (m.notes || '').toLowerCase().includes(q)
        return nameHit || tagHit || notesHit
      })
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter((m: Move) =>
        selectedTags.every((tag: string) => m.tags?.includes(tag))
      )
    }

    // Difficulty filter
    if (selectedDifficulty) {
      filtered = filtered.filter((m: Move) => m.difficulty === selectedDifficulty)
    }

    return filtered
  }, [moves, searchQuery, selectedTags, selectedDifficulty])

  const canSave = name.trim().length > 0 && selectedMoveIds.length > 0 && !saving

  const selectedCountLabel = useMemo(() => {
    const n = selectedMoveIds.length
    if (n === 0) return 'No moves selected'
    if (n === 1) return '1 move selected'
    return `${n} moves selected`
  }, [selectedMoveIds.length])

  const selectedMovesData = useMemo(() => {
    const moveMap = new Map(moves.map((m: Move) => [m.id, m]))
    return selectedMoveIds.map((id: string) => moveMap.get(id)).filter(Boolean) as Move[]
  }, [selectedMoveIds, moves])

  const toggle = (id: string) => {
    setSelectedMoveIds((prev: string[]) => (prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id]))
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev: string[]) =>
      prev.includes(tag) ? prev.filter((t: string) => t !== tag) : [...prev, tag]
    )
  }

  const toggleDifficulty = (difficulty: Difficulty) => {
    setSelectedDifficulty((prev) => (prev === difficulty ? null : difficulty))
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedTags([])
    setSelectedDifficulty(null)
  }

  const hasActiveFilters = searchQuery.length > 0 || selectedTags.length > 0 || selectedDifficulty !== null

  const handleSave = async () => {
    const cleanName = name.trim()
    if (!cleanName) return
    if (selectedMoveIds.length === 0) return

    setSaving(true)
    try {
      if (editingRoutine) {
        await updateRoutineRow(editingRoutine.id, { name: cleanName, moves_order: selectedMoveIds })
        Alert.alert('Saved', 'Your routine was updated.')
        clearEditing()
      } else {
        await saveRoutine({ name: cleanName, moves_order: selectedMoveIds })
        setName('')
        setSelectedMoveIds([])
        Alert.alert('Saved', 'Your routine is ready.')
      }
      refetchRoutines()
    } catch (e: any) {
      Alert.alert('Could not save routine', e?.message || 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteRoutine = (id: string, routineName: string) => {
    Alert.alert('Delete routine?', `This will permanently delete "${routineName}"`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoutineRow(id)
            refetchRoutines()
            if (routineId === id) clearEditing()
          } catch (e: any) {
            Alert.alert('Delete failed', e?.message || 'Unknown error')
          }
        },
      },
    ])
  }

  const openRoutineActions = (routine: RoutineRow) => {
    const rid = String(routine.id)
    const rname = String(routine.name || 'Routine')

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Edit', 'Delete'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          title: 'Routine actions',
        },
        (idx: number) => {
          if (idx === 1) navigation.navigate('Routines', { routineId: rid })
          if (idx === 2) confirmDeleteRoutine(rid, rname)
        }
      )
    } else {
      Alert.alert('Routine actions', '', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit', onPress: () => navigation.navigate('Routines', { routineId: rid }) },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteRoutine(rid, rname) },
      ])
    }
  }

  const goToLibraryRoutine = (rid: string) => {
    // Navigate to Library tab's LibraryHome screen with params
    // For nested navigators, we need to specify the screen and params
    const parent = navigation.getParent?.()
    const navTarget = {
      screen: 'LibraryHome',
      params: { initialTab: 'routines', routineId: rid },
    }
    
    if (parent) {
      parent.navigate('Library', navTarget)
    } else {
      // Fallback: try direct navigation
      navigation.navigate('Library', navTarget)
    }
  }

  const removeSelectedMove = (id: string) => {
    setSelectedMoveIds((prev: string[]) => prev.filter((x: string) => x !== id))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{editingRoutine ? 'Edit routine' : 'Routine'}</Text>
        <Text style={styles.subtitle}>Search and pick moves to create a sequence.</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.composerCard}>
          <Text style={styles.sectionTitle}>{editingRoutine ? 'Update routine' : 'Create a routine'}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Routine name (e.g. Warm-up Flow)"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={styles.input}
          />

          {editingRoutine && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Pressable onPress={clearEditing} style={[styles.secondaryButton, { flex: 1 }]}>
                <Text style={styles.secondaryButtonText}>Cancel edit</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDeleteRoutine(editingRoutine.id, editingRoutine.name)}
                style={[styles.dangerButton, { flex: 1 }]}
              >
                <Text style={styles.dangerButtonText}>Delete</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Selected moves</Text>
            <Text style={styles.sectionMeta}>{selectedCountLabel}</Text>
          </View>

          {selectedMoveIds.length > 0 ? (
            <View style={styles.selectedMovesList}>
              {selectedMovesData.map((move: any, idx: number) => (
                <View key={move.id} style={styles.selectedMoveChip}>
                  <Text style={styles.selectedMoveNumber}>{idx + 1}.</Text>
                  <Text style={styles.selectedMoveName} numberOfLines={1}>{move.name}</Text>
                  <Pressable onPress={() => removeSelectedMove(move.id)} hitSlop={8}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noMovesSelectedText}>No moves selected yet</Text>
          )}

          <Pressable onPress={() => setModalVisible(true)} style={styles.addMovesButton}>
            <MaterialCommunityIcons name="plus-circle" size={18} color={theme.colors.primary} />
            <Text style={styles.addMovesButtonText}>Add moves</Text>
          </Pressable>

          <Pressable onPress={handleSave} disabled={!canSave} style={[styles.saveButton, !canSave && { opacity: 0.6 }]}>
            {saving ? (
              <ActivityIndicator color={theme.colors.onPrimary} />
            ) : (
              <Text style={styles.saveText}>{editingRoutine ? 'Save changes' : 'Save routine'}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Your routines</Text>
        </View>

        {routinesLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: theme.spacing.md }}>
            {routines.length > 0 ? (
              routines.map((item: RoutineRow) => (
                <Pressable 
                  key={item.id} 
                  style={styles.routineRow} 
                  onPress={() => goToLibraryRoutine(item.id)}
                  onLongPress={() => openRoutineActions(item)}
                >
                  <View style={styles.routineIconContainer}>
                    <MaterialCommunityIcons name="playlist-music" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routineName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.routineMeta} numberOfLines={1}>
                      {(item.moves_order?.length ?? 0)} moves • {item.difficulty || 'Any level'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={(e: any) => {
                      e.stopPropagation()
                      openRoutineActions(item)
                    }}
                    hitSlop={10}
                    style={{ paddingHorizontal: 8, paddingVertical: 8 }}
                  >
                    <MaterialCommunityIcons name="dots-vertical" size={20} color={theme.colors.muted} />
                  </Pressable>
                </Pressable>
              ))
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No routines yet</Text>
                <Text style={styles.emptySubtitle}>Create one above to save your favorite sequences.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Moves Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add moves to routine</Text>
            <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.modalContent}>
            {/* Search */}
            <View style={styles.searchRow}>
              <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.onSurfaceVariant} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by name, tag, or notes"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>

            {/* Difficulty filter */}
            {allDifficulties.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Difficulty</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {(allDifficulties as Difficulty[]).map((diff) => {
                    const isSelected = selectedDifficulty === diff
                    return (
                      <Pressable
                        key={diff}
                        onPress={() => toggleDifficulty(diff)}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {diff}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            )}

            {/* Tag filter */}
            {allTags.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Tags</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {allTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag)
                    return (
                      <Pressable
                        key={tag}
                        onPress={() => toggleTag(tag)}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                          {tag}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            )}

            {hasActiveFilters && (
              <Pressable onPress={clearFilters} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>Clear all filters</Text>
              </Pressable>
            )}

            {movesLoading ? (
              <View style={styles.centerInline}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.centerInlineText}>Loading moves…</Text>
              </View>
            ) : (
              <FlatList
                data={filteredMoves}
                keyExtractor={(m) => m.id}
                contentContainerStyle={{ paddingBottom: 24 }}
                renderItem={({ item }: { item: Move }) => {
                  const checked = selectedMoveIds.includes(item.id)
                  return (
                    <Pressable onPress={() => toggle(item.id)} style={[styles.moveRow, checked && styles.moveRowChecked]}>
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <MaterialCommunityIcons name="check" size={14} color={theme.colors.onPrimary} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.moveName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.moveMeta} numberOfLines={1}>
                          {item.difficulty} • {(item.tags || []).slice(0, 3).join(' • ') || 'No tags'}
                        </Text>
                      </View>
                    </Pressable>
                  )
                }}
                ListEmptyComponent={
                  <View style={{ paddingVertical: 14 }}>
                    <Text style={{ color: theme.colors.muted }}>
                      {hasActiveFilters ? 'No moves match your filters.' : 'No moves yet — create a move first.'}
                    </Text>
                  </View>
                }
              />
            )}
          </View>

          <View style={styles.modalFooter}>
            <Pressable onPress={() => setModalVisible(false)} style={styles.doneButton}>
              <Text style={styles.doneButtonText}>Done ({selectedMoveIds.length} selected)</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
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
  title: {
    fontSize: theme.type.h2,
    fontWeight: '900',
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: theme.colors.muted,
  },
  secondaryButton: {
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  dangerButton: {
    backgroundColor: theme.colors.error + '15',
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.error + '30',
  },
  dangerButtonText: {
    color: theme.colors.error,
    fontWeight: '900',
  },
  composerCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: 10,
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: theme.radii.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: '900',
    color: theme.colors.text,
  },
  sectionMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    marginTop: 10,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: theme.radii.md,
    padding: 12,
    color: theme.colors.text,
  },
  selectedMovesList: {
    gap: 6,
  },
  selectedMoveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary + '15',
    borderRadius: theme.radii.md,
    padding: 10,
  },
  selectedMoveNumber: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.colors.primary,
  },
  selectedMoveName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  noMovesSelectedText: {
    paddingVertical: 12,
    color: theme.colors.muted,
    fontStyle: 'italic',
    fontSize: 13,
  },
  addMovesButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary + '18',
    borderRadius: theme.radii.md,
  },
  addMovesButtonText: {
    color: theme.colors.primary,
    fontWeight: '800',
    fontSize: 15,
  },
  saveButton: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: {
    color: theme.colors.onPrimary,
    fontWeight: '900',
  },
  listHeader: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 14,
    paddingBottom: 8,
  },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    padding: 12,
    marginBottom: 10,
  },
  routineIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineName: {
    fontWeight: '900',
    color: theme.colors.text,
  },
  routineMeta: {
    marginTop: 4,
    color: theme.colors.muted,
  },
  empty: {
    marginTop: 20,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.text,
  },
  emptySubtitle: {
    marginTop: 6,
    color: theme.colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerInline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  centerInlineText: { color: theme.colors.muted },
  modalSafe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.muted,
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: theme.spacing.md,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.surfaceVariant,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 20,
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  chipTextSelected: {
    color: theme.colors.onPrimary,
  },
  clearButton: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
  },
  moveRowChecked: {
    backgroundColor: theme.colors.primary + '08',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  moveName: {
    fontWeight: '800',
    color: theme.colors.text,
  },
  moveMeta: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 12,
  },
  modalFooter: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
  },
  doneButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: theme.colors.onPrimary,
    fontWeight: '900',
    fontSize: 16,
  },
})