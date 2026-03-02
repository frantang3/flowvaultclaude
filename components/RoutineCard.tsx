import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, LayoutAnimation, UIManager, Platform, ActivityIndicator, Alert, ActionSheetIOS, Animated } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import theme from '../lib/theme'
import MoveRow from './MoveRow'
import supabase from '../lib/supabase'
import { Move } from '../types/move'
import { RoutineRow, deleteRoutineRow } from '../lib/routines'
import { useNavigation } from '@react-navigation/native'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const cache: Record<string, { moves: Move[]; fetchedAt: number }> = {}

export default function RoutineCard({ 
  routine,
  initiallyCollapsed = true,
  onDelete,
  externalCollapsed,
}: {
  routine: RoutineRow
  initiallyCollapsed?: boolean
  onDelete?: (id: string) => void
  externalCollapsed?: boolean
}) {
  const navigation = useNavigation<any>()
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const [fadeAnim] = useState(new Animated.Value(0))
  
  // Sync external collapsed changes
  useEffect(() => {
    if (typeof externalCollapsed === 'boolean') {
      setCollapsed(externalCollapsed)
    }
  }, [externalCollapsed])

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }, [fadeAnim])
  
  const [loading, setLoading] = useState(false)
  const [moves, setMoves] = useState<Move[]>(cache[routine.id]?.moves || [])
  const mountedAt = useRef(Date.now())

  const needsFetch = useMemo(() => moves.length === 0, [moves.length])

  const toggle = async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    const next = !collapsed
    setCollapsed(next)
    if (!next && needsFetch) {
      await fetchMoves()
    }
  }

  async function fetchMoves(force = false) {
    if (loading) return
    if (!force && cache[routine.id]?.moves?.length) {
      setMoves(cache[routine.id].moves)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('moves')
        .select('*')
        .in('id', routine.moves_order)
      if (error) throw error

      const mapMove = (row: any): Move => ({
        id: row.id,
        name: row.name,
        difficulty: row.difficulty,
        tags: row.tags || [],
        notes: row.notes || undefined,
        videoUrl: row.video_url || null,
        imageUrl: row.image_url || null,
        thumbUrl: row.image_url || null,
        createdAt: row.created_at,
      })

      const result = (data || []).map(mapMove)
      // order according to moves_order
      const order = new Map<string, number>()
      routine.moves_order.forEach((id, idx) => order.set(id, idx))
      result.sort((a: Move, b: Move) => (order.get(a.id)! - order.get(b.id)!))

      cache[routine.id] = { moves: result, fetchedAt: Date.now() }
      setMoves(result)
    } catch (e: any) {
      Alert.alert('Failed to load moves', e?.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    const parent = navigation.getParent?.()
    if (parent) parent.navigate('Routines', { routineId: routine.id })
    else navigation.navigate('Routines', { routineId: routine.id })
  }

  const handleDelete = () => {
    Alert.alert('Delete routine?', `This will permanently delete \"${routine.name}\"`, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await deleteRoutineRow(routine.id)
            delete cache[routine.id]
            onDelete?.(routine.id)
          } catch (e: any) {
            Alert.alert('Delete failed', e?.message || 'Unknown error')
          }
        }
      }
    ])
  }

  const openActionMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Edit', 'Delete'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
          title: 'Actions'
        },
        (buttonIndex: number) => {
          if (buttonIndex === 1) handleEdit()
          else if (buttonIndex === 2) handleDelete()
        }
      )
    } else {
      Alert.alert(
        'Actions',
        '',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Edit', onPress: handleEdit },
          { text: 'Delete', style: 'destructive', onPress: handleDelete },
        ],
        { cancelable: true }
      )
    }
  }

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={styles.card}>
        <Pressable onPress={toggle} style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{routine.name}</Text>
            <Text style={styles.meta}>
              {routine.moves_order.length} moves • {new Date(routine.created_at).toLocaleDateString()}
            </Text>
            <View style={styles.metaRow}>
              {routine.difficulty ? (
                <View style={styles.diffPill}>
                  <Text style={styles.diffText}>{routine.difficulty}</Text>
                </View>
              ) : null}
              {(routine.tags || []).slice(0, 4).map((tag, idx) => (
                <View key={idx} style={styles.tagChip}><Text style={styles.tagText}>{tag}</Text></View>
              ))}
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable 
              onPress={openActionMenu}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.moreButton}
            >
              <MaterialIcons 
                name="more-vert" 
                size={24} 
                color={theme.colors.text} 
              />
            </Pressable>
            <MaterialIcons 
              name={collapsed ? 'expand-more' : 'expand-less'} 
              size={24} 
              color={theme.colors.muted} 
              style={{ transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }}
            />
          </View>
        </Pressable>

        {!collapsed && (
          <View style={styles.body}>
            {!!routine.description && (
              <Text style={styles.description}>{routine.description}</Text>
            )}

            {loading ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : (
              <View>
                {moves.map((m: Move) => (
                  <View key={m.id}>
                    <MoveRow move={m} />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    marginHorizontal: theme.spacing.md,
    marginBottom: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  name: {
    fontWeight: '700',
    fontSize: theme.type.h3,
    color: theme.colors.text,
  },
  meta: {
    color: theme.colors.muted,
    marginTop: 2,
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginTop: 6,
  },
  diffPill: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  diffText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  tagChip: {
    backgroundColor: theme.colors.primary + '11',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moreButton: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  description: {
    color: theme.colors.text,
    marginBottom: 8,
    fontSize: 13,
  },
})