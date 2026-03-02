import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet, Text } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import theme from '../lib/theme'

type Props = {
  visible: boolean
  onDismiss?: () => void
  message?: string
  duration?: number
}

export default function SuccessToast({ visible, onDismiss, message, duration = 1500 }: Props) {
  const scaleAnim = useRef(new Animated.Value(0)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      // Pulse animation: scale up and fade in
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()

      // Auto dismiss
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onDismiss?.()
        })
      }, duration)

      return () => clearTimeout(timer)
    } else {
      scaleAnim.setValue(0)
      opacityAnim.setValue(0)
    }
  }, [visible, duration, scaleAnim, opacityAnim, onDismiss])

  if (!visible) return null

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={styles.content}>
        <MaterialIcons name="check-circle" size={48} color={theme.colors.success} />
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 999,
  },
  content: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  message: {
    marginTop: 12,
    fontSize: theme.type.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
})