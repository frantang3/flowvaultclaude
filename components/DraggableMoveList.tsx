import React from 'react'
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
// ... existing code ...
// Remove static import of react-native-draggable-flatlist and use a safe dynamic require with fallback
let DraggableFlatList: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DraggableFlatList = require('react-native-draggable-flatlist').default
} catch (e) {
  DraggableFlatList = null
}
// ... existing code ...
import { Move } from '../types/move'
import theme from '../lib/theme'
import MediaPreview from './MediaPreview'

type Props = {
  moves: Move[]
  onReorder: (newOrder: Move[]) => void
  onCardPress?: (move: Move) => void
}

export default function DraggableMoveList({ moves, onReorder, onCardPress }: Props) {
  // If draggable package exists, render the draggable list
  if (DraggableFlatList) {
    const renderItem = ({ item, drag, isActive }: { item: Move; drag: () => void; isActive: boolean }) => {
      return (
        <Pressable
          onPress={() => onCardPress?.(item)}
          onLongPress={drag}
          disabled={isActive}
          style={[styles.card, isActive && styles.cardActive]}
        >
          <View style={styles.dragHandle}>
            <MaterialIcons name="drag-indicator" size={24} color={theme.colors.muted} />
          </View>

          <View style={styles.mediaContainer}>
            <MediaPreview
              videoUrl={item.videoUrl}
              imageUrl={item.imageUrl}
              mode="card"
            />
          </View>

          <View style={styles.content}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.difficultyPill}>
                <Text style={styles.difficultyText}>{item.difficulty}</Text>
              </View>
              {item.tags.slice(0, 2).map((tag, idx) => (
                <View key={idx} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        </Pressable>
      )
    }

    return (
      <DraggableFlatList
        data={moves}
        keyExtractor={(item: Move) => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }: { data: Move[] }) => {
          // Haptic feedback on successful drag
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
          onReorder(data)
        }}
        contentContainerStyle={styles.listContent}
      />
    )
  }

  // Fallback: regular FlatList with up/down controls to reorder.
  // This avoids a crash when the draggable package isn't installed and keeps the UI usable.
  const moveItem = (index: number, direction: number = -1) => {
    const newOrder = moves.slice()
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= newOrder.length) return
    const temp = newOrder[index]
    newOrder[index] = newOrder[targetIndex]
    newOrder[targetIndex] = temp
    onReorder(newOrder)
  }

  return (
    <FlatList
      data={moves}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() => onCardPress?.(item)}
          style={styles.card}
        >
          <View style={styles.dragHandle}>
            <MaterialIcons name="drag-indicator" size={24} color={theme.colors.muted} />
            <View style={styles.reorderControls}>
              <Pressable onPress={() => moveItem(index, -1)} style={styles.reorderButton}>
                <MaterialIcons name="expand-less" size={20} color={theme.colors.muted} />
              </Pressable>
              <Pressable onPress={() => moveItem(index, 1)} style={styles.reorderButton}>
                <MaterialIcons name="expand-more" size={20} color={theme.colors.muted} />
              </Pressable>
            </View>
          </View>

          <View style={styles.mediaContainer}>
            <MediaPreview
              videoUrl={item.videoUrl}
              imageUrl={item.imageUrl}
              mode="card"
            />
          </View>

          <View style={styles.content}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.difficultyPill}>
                <Text style={styles.difficultyText}>{item.difficulty}</Text>
              </View>
              {item.tags.slice(0, 2).map((tag, idx) => (
                <View key={idx} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        </Pressable>
      )}
      ListFooterComponent={() => (
        <View style={styles.fallbackNote}>
          <MaterialIcons name="info" size={16} color={theme.colors.muted} />
          <Text style={styles.fallbackNoteText}>
            Drag-and-drop available after installing "react-native-draggable-flatlist".
          </Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    marginHorizontal: theme.spacing.md,
    marginVertical: 6,
    padding: theme.spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardActive: {
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  dragHandle: {
    marginRight: 8,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderControls: {
    flexDirection: 'column',
    marginTop: 2,
  },
  reorderButton: {
    padding: 2,
  },
  mediaContainer: {
    width: 80,
    height: 45,
    borderRadius: theme.radii.sm,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: theme.type.body,
    fontWeight: '700',
    color: theme.colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  difficultyPill: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  difficultyText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  tagChip: {
    backgroundColor: theme.colors.primary + '11',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 10,
  },
  fallbackNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: theme.spacing.md,
    marginTop: 8,
  },
  fallbackNoteText: {
    color: theme.colors.muted,
    fontSize: theme.type.small,
  },
})