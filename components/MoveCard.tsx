import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Pressable, Alert, Animated, Platform, ActionSheetIOS } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { Move } from '../types/move'
import theme from '../lib/theme'
import MediaPreview from './MediaPreview'
import { useAuthActions } from '../hooks/useAuth'
import { useMoves as useMovesQuery } from '../hooks/useMovesQuery'

type Props = {
  move: Move
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  onPress?: () => void
  onDelete?: () => void
  dragHandle?: any
}

export default function MoveCard({ 
  move, 
  isCollapsed = false, 
  onToggleCollapse, 
  onPress, 
  onDelete,
  dragHandle 
}: Props) {
  const navigation = useNavigation()
  const { uid } = useAuthActions()
  const { deleteMove } = useMovesQuery(uid)
  const [chevronRotation] = useState(new Animated.Value(isCollapsed ? 0 : 90))
  const [fadeAnim] = useState(new Animated.Value(0))
  const [showActionMenu, setShowActionMenu] = useState(false)

  useEffect(() => {
    // Fade in on mount
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }, [fadeAnim])

  React.useEffect(() => {
    Animated.spring(chevronRotation, {
      toValue: isCollapsed ? 0 : 90,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start()

    console.log(`[card ${move.id}] collapsed=${isCollapsed}`)
  }, [isCollapsed, chevronRotation, move.id])

  const handleCardPress = () => {
    if (onPress) {
      onPress()
    } else {
      navigation.navigate('MoveDetails' as never, { moveId: move.id } as never)
    }
  }

  const handleChevronPress = (e: any) => {
    e.stopPropagation()
    if (onToggleCollapse) {
      onToggleCollapse()
    }
  }

  const handleViewDetails = () => {
    setShowActionMenu(false)
    navigation.navigate('MoveDetails' as never, { moveId: move.id } as never)
  }

  const handleEdit = () => {
    setShowActionMenu(false)
    navigation.navigate('MoveEdit' as never, { mode: 'edit', id: move.id } as never)
  }

  const handleDelete = () => {
    setShowActionMenu(false)
    Alert.alert(
      'Delete this move?',
      "This can't be undone",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMove(move.id)
              if (onDelete) onDelete()
            } catch (err) {
              console.warn('Delete failed:', err)
              Alert.alert('Error', 'Failed to delete move')
            }
          },
        },
      ]
    )
  }

  const openActionMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'View Details', 'Edit', 'Delete'],
          destructiveButtonIndex: 3,
          cancelButtonIndex: 0,
          title: 'Actions'
        },
        (buttonIndex: number) => {
          if (buttonIndex === 1) handleViewDetails()
          else if (buttonIndex === 2) handleEdit()
          else if (buttonIndex === 3) handleDelete()
        }
      )
    } else {
      // For Android, show simple menu or Alert with options
      Alert.alert(
        'Actions',
        '',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Details', onPress: handleViewDetails },
          { text: 'Edit', onPress: handleEdit },
          { text: 'Delete', style: 'destructive', onPress: handleDelete },
        ],
        { cancelable: true }
      )
    }
  }

  const displayTags = isCollapsed ? move.tags.slice(0, 3) : move.tags

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={styles.card}>
        {dragHandle && <View style={styles.dragHandleContainer}>{dragHandle}</View>}

        {isCollapsed ? (
          <Pressable
            onPress={handleCardPress}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${move.name}, ${move.difficulty}, collapsed`}
            style={styles.collapsedContent}
          >
            <View style={styles.collapsedHeader}>
              <Text style={styles.name} numberOfLines={1}>{move.name}</Text>
              <View style={styles.headerActions}>
                <Pressable 
                  onPress={handleChevronPress} 
                  style={styles.chevronButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Animated.View style={{ transform: [{ rotate: chevronRotation.interpolate({
                    inputRange: [0, 90],
                    outputRange: ['0deg', '90deg']
                  })}]}}>
                    <MaterialIcons name="chevron-right" size={24} color={theme.colors.text} />
                  </Animated.View>
                </Pressable>
              </View>
            </View>

            <View style={styles.collapsedMeta}>
              <View style={styles.difficultyPill}>
                <Text style={styles.difficultyText}>{move.difficulty}</Text>
              </View>
              <View style={styles.tagsRow}>
                {displayTags.map((tag, idx) => (
                  <View key={idx} style={styles.tagChip}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
                {move.tags.length > 3 && (
                  <Text style={styles.moreTagsText}>+{move.tags.length - 3}</Text>
                )}
              </View>
            </View>
          </Pressable>
        ) : (
          <>
            {/* Media is NOT inside a Pressable so native video controls can receive gestures (scrub) */}
            <View style={styles.mediaContainer}>
              <MediaPreview
                videoUrl={move.videoUrl}
                imageUrl={move.imageUrl}
                thumbUrl={move.thumbUrl}
                mode="card"
                moveId={move.id}
              />
            </View>

            {/* Metadata area remains tappable */}
            <Pressable
              onPress={handleCardPress}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`${move.name}, ${move.difficulty}, expanded`}
              style={styles.expandedContent}
            >
              <View style={styles.expandedHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>{move.name}</Text>
                </View>
                <View style={styles.headerActions}>
                  <Pressable 
                    onPress={openActionMenu}
                    style={styles.moreButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="more-vert" size={24} color={theme.colors.text} />
                  </Pressable>
                  <Pressable 
                    onPress={handleChevronPress} 
                    style={styles.chevronButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Animated.View style={{ transform: [{ rotate: chevronRotation.interpolate({
                      inputRange: [0, 90],
                      outputRange: ['0deg', '90deg']
                    })}]}}>
                      <MaterialIcons name="chevron-right" size={24} color={theme.colors.text} />
                    </Animated.View>
                  </Pressable>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.difficultyPill}>
                  <Text style={styles.difficultyText}>{move.difficulty}</Text>
                </View>
                <View style={styles.tagsRow}>
                  {move.tags.map((tag, idx) => (
                    <View key={idx} style={styles.tagChip}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {move.notes && (
                <Text style={styles.notes}>{move.notes}</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    marginHorizontal: theme.spacing.md,
    marginVertical: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  dragHandleContainer: {
    position: 'absolute',
    left: 8,
    top: '50%',
    transform: [{ translateY: -12 }],
    zIndex: 10,
  },
  collapsedContent: {
    padding: theme.spacing.md,
    minHeight: 60,
  },
  collapsedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: theme.type.h3,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
  },
  chevronButton: {
    padding: 8,
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moreButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
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
  },
  moreTagsText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  mediaContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  expandedContent: {
    padding: theme.spacing.md,
  },
  notes: {
    color: theme.colors.muted,
    fontSize: theme.type.small,
    marginTop: 8,
  },
})