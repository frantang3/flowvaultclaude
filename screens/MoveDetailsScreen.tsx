import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import theme from '../lib/theme'
import { useAuthActions } from '../hooks/useAuth'
import { useMoves as useMovesQuery } from '../hooks/useMovesQuery'
import { usePractice } from '../hooks/usePractice'
import MediaPreview from '../components/MediaPreview'
import type { Move } from '../types/move'

type Params = { moveId: string }

export default function MoveDetailsScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const params = (route.params || {}) as any
  const moveId: string | undefined = params.moveId

  const { uid } = useAuthActions()
  const { moves, deleteMove } = useMovesQuery(uid)
  const { getDrillCount } = usePractice(uid)
  const [videoAspect, setVideoAspect] = useState<number | null>(null)

  const move = useMemo(() => {
    if (!moveId) return null
    return moves.find((m: Move) => m.id === moveId) || null
  }, [moveId, moves])

  const drillInfo = useMemo(() => {
    if (!moveId) return null
    return getDrillCount(moveId)
  }, [moveId, getDrillCount])

  const handleDelete = () => {
    if (!moveId) return

    Alert.alert('Delete move?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMove(moveId)
            navigation.goBack()
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete')
          }
        },
      },
    ])
  }

  const handleEdit = () => {
    if (!moveId) return
    navigation.navigate('MoveEdit', { mode: 'edit', id: moveId })
  }

  if (!move) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.title}>Move</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Move not found</Text>
          <Text style={styles.emptySubtitle}>It may have been deleted or hasnt synced yet.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const hasMedia = !!(move.videoUrl || move.imageUrl || move.thumbUrl)
  const computedAspect = (() => {
    // For vertical videos, use full portrait aspect
    // For horizontal videos, use their natural aspect up to 16:9
    if (videoAspect && Number.isFinite(videoAspect) && videoAspect > 0) {
      // Allow very tall portrait videos (up to 9:16) and wide landscape (up to 16:9)
      return Math.max(9 / 21, Math.min(21 / 9, videoAspect))
    }
    // Default to portrait for videos, landscape for images
    if (move.videoUrl) return 9 / 16
    return 16 / 9
  })()

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.title}>Move details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {hasMedia && (
          <View style={styles.mediaWrapper}>
            <View style={[styles.mediaContainer, { aspectRatio: computedAspect }]}>
              <MediaPreview
                videoUrl={move.videoUrl}
                imageUrl={move.imageUrl}
                thumbUrl={move.thumbUrl}
                mode="details"
                onVideoAspectRatio={(a) => {
                  if (Number.isFinite(a) && a > 0) setVideoAspect(a)
                }}
              />
            </View>
          </View>
        )}

        <View style={styles.detailsCard}>
          <Text style={styles.name}>{move.name}</Text>

          <View style={styles.metaRow}>
            <View style={styles.difficultyPill}>
              <Text style={styles.difficultyText}>{move.difficulty}</Text>
            </View>
            <View style={styles.tagsRow}>
              {(move.tags || []).map((tag: string, idx: number) => (
                <View key={`${tag}-${idx}`} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          {!!move.notes && <Text style={styles.notes}>{move.notes}</Text>}

          {/* Practice stats */}
          {drillInfo && drillInfo.count > 0 && (
            <View style={styles.drillStatsRow}>
              <MaterialCommunityIcons name="lightning-bolt" size={16} color={theme.colors.primary} />
              <Text style={styles.drillStatsText}>
                Drilled {drillInfo.count} time{drillInfo.count !== 1 ? 's' : ''}
                {drillInfo.last_drilled_at
                  ? ` · Last: ${new Date(drillInfo.last_drilled_at).toLocaleDateString()}`
                  : ''}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable onPress={handleEdit} style={[styles.actionButton, styles.primaryAction]}>
            <MaterialCommunityIcons name="pencil" size={18} color={theme.colors.onPrimary} />
            <Text style={[styles.actionText, { color: theme.colors.onPrimary }]}>Edit</Text>
          </Pressable>

          <Pressable onPress={handleDelete} style={[styles.actionButton, styles.destructiveAction]}>
            <MaterialCommunityIcons name="trash-can" size={18} color={theme.colors.error} />
            <Text style={[styles.actionText, { color: theme.colors.error }]}>Delete</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  mediaWrapper: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  mediaContainer: {
    width: '100%',
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceVariant,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.type.h3,
    fontWeight: '900',
    color: theme.colors.text,
  },
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    marginHorizontal: theme.spacing.md,
    marginTop: 12,
    padding: theme.spacing.md,
  },
  name: {
    fontSize: theme.type.h2,
    fontWeight: '900',
    color: theme.colors.text,
    ...theme.fonts.heading,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  difficultyPill: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  difficultyText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 12,
    ...theme.fonts.bodySemiBold,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    gap: 6,
  },
  tagChip: {
    backgroundColor: theme.colors.primary + '11',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagText: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 11,
    ...theme.fonts.bodySemiBold,
  },
  notes: {
    marginTop: 12,
    color: theme.colors.muted,
    lineHeight: 20,
    ...theme.fonts.body,
  },
  drillStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
  },
  drillStatsText: {
    fontSize: 13,
    color: theme.colors.primary,
    ...theme.fonts.bodySemiBold,
  },
  actions: {
    paddingHorizontal: theme.spacing.md,
    marginTop: 12,
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  primaryAction: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  destructiveAction: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.outline,
  },
  actionText: {
    fontWeight: '900',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
  },
  emptySubtitle: {
    marginTop: 6,
    color: theme.colors.muted,
    lineHeight: 20,
  },
})