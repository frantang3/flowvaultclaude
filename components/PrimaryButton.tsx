import React from 'react'
import { Pressable, Text, StyleSheet, Animated } from 'react-native'
import theme from '../lib/theme'
import { useScalePress } from '../hooks/useScalePress'

type Props = {
  title: string
  onPress?: () => void
  style?: any
  titleStyle?: any
  accessibilityLabel?: string
  disabled?: boolean
}

export default function PrimaryButton({ title, onPress, style, titleStyle, accessibilityLabel, disabled }: Props) {
  const { scaleAnim, animateIn, animateOut } = useScalePress(1.05)

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        accessibilityLabel={accessibilityLabel || title}
        onPress={disabled ? undefined : onPress}
        onPressIn={disabled ? undefined : animateIn}
        onPressOut={disabled ? undefined : animateOut}
        style={({ pressed }: any) => [styles.button, pressed && !disabled && styles.pressed, disabled && styles.disabled, style]}
      >
        <Text style={[styles.text, disabled && styles.textDisabled, titleStyle]}>{title}</Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: theme.colors.onPrimary,
    fontSize: theme.type.body,
    fontWeight: '600',
  },
  textDisabled: {
    color: theme.colors.onPrimary,
  },
})