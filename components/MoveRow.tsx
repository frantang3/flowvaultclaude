import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import theme from '../lib/theme'
import MediaPreview from './MediaPreview'
import { Move } from '../types/move'

export default function MoveRow({ move, forceCollapsed }: { move: Move; forceCollapsed?: boolean }) {
  const navigation = useNavigation<any>()
  const [showFullNotes, setShowFullNotes] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Sync local state with forceCollapsed prop
  useEffect(() => {
    if (forceCollapsed !== undefined) {
      setIsCollapsed(forceCollapsed)
    }
  }, [forceCollapsed])

  const hasNotes = !!(move.notes && move.notes.trim().length > 0)

  if (isCollapsed) {
    return (
      <Pressable
        onPress={() => setIsCollapsed(false)}
        style={styles.containerCollapsed}
      >
        <View style={styles.collapsedContent}>
          <Text style={styles.name} numberOfLines={1}>{move.name}</Text>
          <View style={styles.collapsedMeta}>
            <View style={styles.diffPill}>
              <Text style={styles.diffText}>{move.difficulty}</Text>
            </View>
            {move.tags.length > 0 && (
              <Text style={styles.tagCount}>+{move.tags.length} tags</Text>
            )}
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.muted} />
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      {/* Collapse button in top-right */}
      <Pressable
        onPress={() => setIsCollapsed(true)}
        style={styles.collapseButton}
        hitSlop={10}
      >
        <MaterialCommunityIcons name="chevron-up" size={18} color={theme.colors.muted} />
      </Pressable>

      {/* Media column - video controls receive touches directly, no wrapper Pressable */}
      <View style={styles.mediaColumn}>
        <MediaPreview
          videoUrl={move.videoUrl || undefined}
          imageUrl={move.imageUrl || undefined}
          thumbUrl={move.thumbUrl || undefined}
          mode="card"
          moveId={move.id}
        />
      </View>

      {/* Content column - tappable for navigation to details */}
      <Pressable
        onPress={() => navigation.navigate('MoveDetails', { moveId: move.id })}
        style={styles.contentColumn}
      >
        <Text style={styles.name} numberOfLines={1}>{move.name}</Text>
        <View style={styles.metaRow}>
          <View style={styles.diffPill}>
            <Text style={styles.diffText}>{move.difficulty}</Text>
          </View>
          {move.tags.slice(0, 3).map((tag, idx) => (
            <View key={idx} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {hasNotes && (
          <View style={styles.notesBlock}>
            <Text
              style={styles.notes}
              numberOfLines={showFullNotes ? undefined : 2}
            >
              {move.notes}
            </Text>
            <Pressable 
              onPress={(e) => {
                e.stopPropagation()
                setShowFullNotes(!showFullNotes)
              }} 
              hitSlop={8}
            >
              <Text style={styles.notesToggle}>{showFullNotes ? 'Show less' : 'Show more'}</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    marginBottom: 10,
    position: 'relative',
  },
  containerCollapsed: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    marginBottom: 10,
    alignItems: 'center',
  },
  collapsedContent: {
    flex: 1,
  },
  collapsedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  tagCount: {
    fontSize: 11,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  collapseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 4,
    backgroundColor: theme.colors.surface + 'CC',
    borderRadius: 12,
  },
  mediaColumn: {
    width: 120,
    height: 68,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceVariant,
  },
  contentColumn: {
    flex: 1,
  },
  name: {
    fontWeight: '700',
    color: theme.colors.text,
    fontSize: theme.type.body,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  diffPill: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  diffText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  tagChip: {
    backgroundColor: theme.colors.primary + '11',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 10,
  },
  notesBlock: {
    marginTop: 8,
  },
  notes: {
    color: theme.colors.text,
    opacity: 0.9,
    fontSize: 12,
    lineHeight: 16,
  },
  notesToggle: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 4,
  },
})