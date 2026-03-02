import React, { useMemo, useState, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, ScrollView, Modal, Platform, Alert, ActionSheetIOS } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import theme from '../lib/theme'
import { useAuthActions } from '../hooks/useAuth'
import { useMoves as useMovesQuery } from '../hooks/useMovesQuery'
import { useRoutines } from '../hooks/useRoutinesQuery'
import MoveRow from '../components/MoveRow'
import MoveCard from '../components/MoveCard'
import type { Move, Difficulty } from '../types/move'
import type { RoutineRow } from '../lib/routines'

type Tab = 'moves' | 'routines'
type SortOption = 'recent' | 'a-z' | 'difficulty'

export default function LibraryScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { uid } = useAuthActions()
  const { moves, isLoading, refetch } = useMovesQuery(uid)
  const { routines, isLoading: routinesLoading, deleteRoutine } = useRoutines(uid)

  const [activeTab, setActiveTab] = useState<Tab>('moves')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([])
  const [expandedRoutineIds, setExpandedRoutineIds] = useState<Set<string>>(new Set())
  const [expandedRoutineMoveIds, setExpandedRoutineMoveIds] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [sortModalVisible, setSortModalVisible] = useState(false)
  const [allCollapsed, setAllCollapsed] = useState(false)

  useEffect(() => {
    const initialTab = route?.params?.initialTab as Tab | undefined
    const routineId = route?.params?.routineId as string | undefined

    if (initialTab === 'routines') {
      setActiveTab('routines')
    }
    if (routineId) {
      setActiveTab('routines')
      setExpandedRoutineIds((prev: Set<string>) => {
        const next = new Set(prev)
        next.add(routineId)
        return next
      })
    }

    if (initialTab || routineId) {
      // prevent re-processing when navigating back
      navigation.setParams({ initialTab: undefined, routineId: undefined })
    }
  }, [navigation, route?.params?.initialTab, route?.params?.routineId])

  // Extract unique tags and difficulties from all moves
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

  const filteredMoves = useMemo(() => {
    let filtered = moves

    // Text search filter
    const q = query.trim().toLowerCase()
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
    if (selectedDifficulties.length > 0) {
      filtered = filtered.filter((m: Move) =>
        selectedDifficulties.includes(m.difficulty)
      )
    }

    return filtered
  }, [moves, query, selectedTags, selectedDifficulties])

  const sortedMoves = useMemo(() => {
    const sorted = [...filteredMoves]
    if (sortBy === 'a-z') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'difficulty') {
      const order: Record<Difficulty, number> = { Beginner: 1, Intermediate: 2, Advanced: 3 }
      sorted.sort((a, b) => (order[a.difficulty as Difficulty] || 0) - (order[b.difficulty as Difficulty] || 0))
    } else {
      // 'recent' - already sorted by created_at desc from query
    }
    return sorted
  }, [filteredMoves, sortBy])

  const filteredRoutines = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return routines

    return routines.filter((r: RoutineRow) => {
      const nameHit = (r.name || '').toLowerCase().includes(q)
      return nameHit
    })
  }, [routines, query])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev: string[]) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const toggleDifficulty = (difficulty: string) => {
    setSelectedDifficulties((prev: string[]) =>
      prev.includes(difficulty) ? prev.filter((d) => d !== difficulty) : [...prev, difficulty]
    )
  }

  const removeTag = (tag: string) => {
    setSelectedTags((prev: string[]) => prev.filter((t: string) => t !== tag))
  }

  const removeDifficulty = (difficulty: string) => {
    setSelectedDifficulties((prev: string[]) => prev.filter((d: string) => d !== difficulty))
  }

  const clearFilters = () => {
    setSelectedTags([])
    setSelectedDifficulties([])
    setQuery('')
  }

  const toggleRoutineExpand = (routineId: string) => {
    setExpandedRoutineIds((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(routineId)) {
        next.delete(routineId)
      } else {
        next.add(routineId)
      }
      return next
    })
  }

  const toggleRoutineMoveExpand = (moveId: string) => {
    setExpandedRoutineMoveIds((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(moveId)) {
        next.delete(moveId)
      } else {
        next.add(moveId)
      }
      return next
    })
  }

  const getRoutineMoves = (routine: RoutineRow) => {
    const moveIds = routine.moves_order || []
    const moveMap = new Map(moves.map((m: Move) => [m.id, m]))
    return moveIds.map((id: string) => moveMap.get(id)).filter(Boolean) as Move[]
  }

  const activeFilterCount = selectedTags.length + selectedDifficulties.length
  const hasActiveFilters = activeFilterCount > 0 || query.length > 0

  const handleAddMove = () => {
    navigation.navigate('MoveEdit', { mode: 'create' })
  }

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'recent', label: 'Recently added' },
    { value: 'a-z', label: 'A–Z' },
    { value: 'difficulty', label: 'Difficulty' },
  ]

  const goToRoutineEdit = (routineId: string) => {
    // Navigate to the Routines tab and load in edit mode
    const parent = navigation.getParent?.()
    if (parent) parent.navigate('Routines', { routineId })
    else Alert.alert('Navigation error', 'Could not open the Routine tab from here.')
  }

  const confirmDeleteRoutine = (routineId: string, routineName: string) => {
    Alert.alert('Delete routine?', `This will permanently delete "${routineName}"`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoutine(routineId)
            setExpandedRoutineIds((prev) => {
              const next = new Set(prev)
              next.delete(routineId)
              return next
            })
          } catch (e: any) {
            Alert.alert('Delete failed', e?.message || 'Unknown error')
          }
        },
      },
    ])
  }

  const openRoutineActions = (routine: any) => {
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
        (idx) => {
          if (idx === 1) goToRoutineEdit(rid)
          if (idx === 2) confirmDeleteRoutine(rid, rname)
        }
      )
    } else {
      Alert.alert('Routine actions', '', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit', onPress: () => goToRoutineEdit(rid) },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteRoutine(rid, rname) },
      ])
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your library</Text>
            <Text style={styles.subtitle}>Find moves, practice smarter</Text>
          </View>
          {activeTab === 'moves' && moves.length > 0 && (
            <View style={styles.headerActions}>
              <Pressable onPress={() => setAllCollapsed(!allCollapsed)} style={styles.collapseAllButton}>
                <MaterialCommunityIcons 
                  name={allCollapsed ? 'unfold-more-horizontal' : 'unfold-less-horizontal'} 
                  size={18} 
                  color={theme.colors.primary} 
                />
              </Pressable>
              <Pressable onPress={handleAddMove} style={styles.addButton}>
                <MaterialCommunityIcons name="plus" size={18} color={theme.colors.primary} />
                <Text style={styles.addButtonText}>Add move</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setActiveTab('moves')}
            style={[styles.tab, activeTab === 'moves' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === 'moves' && styles.tabTextActive]}>
              Moves ({moves.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('routines')}
            style={[styles.tab, activeTab === 'routines' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === 'routines' && styles.tabTextActive]}>
              Routines ({routines.length})
            </Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.onSurfaceVariant} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={activeTab === 'moves' ? 'Search by name, tag, or notes' : 'Search routines'}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={styles.searchInput}
            returnKeyType="search"
          />
          <Pressable onPress={() => { setQuery(''); refetch() }} hitSlop={10}>
            <MaterialCommunityIcons name="refresh" size={18} color={theme.colors.primary} />
          </Pressable>
        </View>

        {activeTab === 'moves' && moves.length > 0 && (
          <>
            {/* Sort and Filter row */}
            <View style={styles.controlsRow}>
              <Pressable onPress={() => setSortModalVisible(true)} style={styles.sortButton}>
                <MaterialCommunityIcons name="sort" size={18} color={theme.colors.text} />
                <Text style={styles.sortButtonText}>
                  Sort: {sortOptions.find((s) => s.value === sortBy)?.label}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.muted} />
              </Pressable>
            </View>

            {/* Active filters display */}
            {(selectedTags.length > 0 || selectedDifficulties.length > 0) && (
              <View style={styles.activeFiltersRow}>
                <Text style={styles.activeFiltersLabel}>Active filters:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersScroll}>
                  {selectedTags.map((tag) => (
                    <Pressable key={tag} onPress={() => removeTag(tag)} style={styles.activeFilterChip}>
                      <Text style={styles.activeFilterText}>{tag}</Text>
                      <MaterialCommunityIcons name="close" size={14} color={theme.colors.primary} />
                    </Pressable>
                  ))}
                  {selectedDifficulties.map((diff) => (
                    <Pressable key={diff} onPress={() => removeDifficulty(diff)} style={styles.activeFilterChip}>
                      <Text style={styles.activeFilterText}>{diff}</Text>
                      <MaterialCommunityIcons name="close" size={14} color={theme.colors.primary} />
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable onPress={clearFilters} style={styles.clearAllButton}>
                  <Text style={styles.clearAllButtonText}>Clear all</Text>
                </Pressable>
              </View>
            )}

            {/* Difficulty Filter Chips */}
            {allDifficulties.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Difficulty</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {allDifficulties.map((diff) => {
                    const isSelected = selectedDifficulties.includes(diff)
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

            {/* Tag Filter Chips */}
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
          </>
        )}
      </View>

      {activeTab === 'moves' ? (
        isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading your moves…</Text>
          </View>
        ) : moves.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="meditation" size={80} color={theme.colors.muted} />
            <Text style={styles.emptyTitle}>No moves yet</Text>
            <Text style={styles.emptySubtitle}>Start building your library by adding your first move.</Text>
            <Pressable onPress={handleAddMove} style={styles.emptyButton}>
              <MaterialCommunityIcons name="plus-circle" size={20} color={theme.colors.onPrimary} />
              <Text style={styles.emptyButtonText}>Add your first move</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={sortedMoves}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => <MoveRow move={item} forceCollapsed={allCollapsed} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No moves match your filters</Text>
                <Text style={styles.emptySubtitle}>Try adjusting your search or filters.</Text>
                {hasActiveFilters && (
                  <Pressable onPress={clearFilters} style={styles.clearFiltersButton}>
                    <Text style={styles.clearFiltersButtonText}>Clear all filters</Text>
                  </Pressable>
                )}
              </View>
            }
          />
        )
      ) : (
        routinesLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading routines…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRoutines}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }: { item: RoutineRow }) => {
              const isExpanded = expandedRoutineIds.has(item.id)
              const routineMoves = getRoutineMoves(item)

              return (
                <View style={styles.routineCard}>
                  <Pressable
                    onPress={() => toggleRoutineExpand(item.id)}
                    style={styles.routineHeader}
                  >
                    <View style={styles.routineIconContainer}>
                      <MaterialCommunityIcons name="playlist-music" size={24} color={theme.colors.primary} />
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
                      style={{ paddingHorizontal: 6, paddingVertical: 6 }}
                    >
                      <MaterialCommunityIcons name="dots-vertical" size={20} color={theme.colors.muted} />
                    </Pressable>
                    <MaterialCommunityIcons 
                      name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                      size={24} 
                      color={theme.colors.muted} 
                    />
                  </Pressable>

                  {isExpanded && (
                    <View style={styles.routineMovesExpanded}>
                      {routineMoves.length > 0 ? (
                        routineMoves.map((move: Move, idx: number) => {
                          const isMovieExpanded = expandedRoutineMoveIds.has(move.id)
                          return (
                            <View key={move.id} style={styles.routineMoveWrapper}>
                              <View style={styles.routineMoveHeader}>
                                <Text style={styles.routineMoveNumber}>{idx + 1}.</Text>
                                <Pressable
                                  onPress={() => toggleRoutineMoveExpand(move.id)}
                                  style={styles.routineMoveHeaderContent}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.routineMoveName}>{move.name}</Text>
                                    <Text style={styles.routineMoveDetail}>
                                      {move.difficulty} • {move.tags.slice(0, 2).join(', ') || 'No tags'}
                                    </Text>
                                  </View>
                                  <MaterialCommunityIcons 
                                    name={isMovieExpanded ? 'chevron-up' : 'chevron-down'} 
                                    size={20} 
                                    color={theme.colors.primary} 
                                  />
                                </Pressable>
                              </View>
                              {isMovieExpanded && (
                                <View style={styles.expandedMoveCard}>
                                  <MoveCard
                                    move={move}
                                    isCollapsed={false}
                                    onToggleCollapse={() => toggleRoutineMoveExpand(move.id)}
                                  />
                                </View>
                              )}
                            </View>
                          )
                        })
                      ) : (
                        <Text style={styles.noMovesText}>No moves in this routine</Text>
                      )}
                    </View>
                  )}
                </View>
              )
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No routines yet</Text>
                <Text style={styles.emptySubtitle}>Create one in the Routine tab.</Text>
              </View>
            }
          />
        )
      )}

      {/* Sort Modal */}
      <Modal visible={sortModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setSortModalVisible(false)}>
          <View style={styles.sortModal}>
            <Text style={styles.sortModalTitle}>Sort by</Text>
            {sortOptions.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  setSortBy(option.value)
                  setSortModalVisible(false)
                }}
                style={styles.sortOption}
              >
                <Text style={[styles.sortOptionText, sortBy === option.value && styles.sortOptionTextActive]}>
                  {option.label}
                </Text>
                {sortBy === option.value && (
                  <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: theme.type.h2,
    fontWeight: '900',
    color: theme.colors.text,
    ...theme.fonts.heading,
  },
  subtitle: {
    marginTop: 4,
    color: theme.colors.muted,
    fontSize: 14,
    ...theme.fonts.body,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapseAllButton: {
    padding: 8,
    backgroundColor: theme.colors.primary + '18',
    borderRadius: theme.radii.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary + '18',
    borderRadius: theme.radii.md,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    ...theme.fonts.bodySemiBold,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: theme.radii.md,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    ...theme.fonts.bodySemiBold,
  },
  tabTextActive: {
    color: theme.colors.onPrimary,
  },
  searchRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    ...theme.fonts.body,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: theme.radii.md,
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    ...theme.fonts.bodySemiBold,
  },
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: theme.radii.md,
  },
  activeFiltersLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
    ...theme.fonts.bodySemiBold,
  },
  activeFiltersScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 8,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
  },
  activeFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
    ...theme.fonts.bodySemiBold,
  },
  clearAllButton: {
    paddingHorizontal: 8,
  },
  clearAllButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
    textDecorationLine: 'underline',
    ...theme.fonts.bodySemiBold,
  },
  filterSection: {
    marginTop: 12,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.muted,
    marginBottom: 6,
    ...theme.fonts.bodySemiBold,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: theme.spacing.md,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
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
    ...theme.fonts.bodySemiBold,
  },
  chipTextSelected: {
    color: theme.colors.onPrimary,
  },
  listContent: {
    padding: theme.spacing.md,
    paddingTop: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  empty: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
    marginTop: 16,
    ...theme.fonts.heading,
  },
  emptySubtitle: {
    marginTop: 6,
    textAlign: 'center',
    color: theme.colors.muted,
    lineHeight: 20,
    ...theme.fonts.body,
  },
  emptyButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: theme.radii.md,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.colors.onPrimary,
    ...theme.fonts.heading,
  },
  clearFiltersButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary + '18',
    borderRadius: theme.radii.md,
  },
  clearFiltersButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
    ...theme.fonts.bodySemiBold,
  },
  routineCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    marginBottom: 10,
    overflow: 'hidden',
  },
  routineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  routineIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineName: {
    fontWeight: '900',
    color: theme.colors.text,
    fontSize: 16,
    ...theme.fonts.heading,
  },
  routineMeta: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 12,
    ...theme.fonts.body,
  },
  routineMovesExpanded: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
  },
  routineMoveWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline + '40',
  },
  routineMoveHeader: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  routineMoveHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routineMoveNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.primary,
    width: 24,
    ...theme.fonts.number,
  },
  routineMoveName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    ...theme.fonts.bodySemiBold,
  },
  routineMoveDetail: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 2,
    ...theme.fonts.body,
  },
  expandedMoveCard: {
    marginLeft: 34,
    marginBottom: 8,
  },
  noMovesText: {
    paddingVertical: 12,
    color: theme.colors.muted,
    fontStyle: 'italic',
    ...theme.fonts.body,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sortModal: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: 16,
    ...theme.fonts.heading,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  sortOptionText: {
    fontSize: 16,
    color: theme.colors.text,
    ...theme.fonts.body,
  },
  sortOptionTextActive: {
    fontWeight: '700',
    color: theme.colors.primary,
    ...theme.fonts.bodySemiBold,
  },
})