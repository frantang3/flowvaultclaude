// components/SmartSlider.tsx
import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import theme from '../lib/theme'

// A thin wrapper that tries to use expo-slider or @react-native-community/slider if available.
// If neither library exists in the project, we gracefully fall back to a basic stepper UI.
// This prevents Metro from failing during bundling when a slider package is missing.

export type SmartSliderProps = {
  style?: any
  minimumValue?: number
  maximumValue?: number
  step?: number
  value: number
  onValueChange: (value: number) => void
  minimumTrackTintColor?: string
  maximumTrackTintColor?: string
}

export default function SmartSlider(props: SmartSliderProps) {
  const {
    style,
    minimumValue = 0,
    maximumValue = 100,
    step = 1,
    value,
    onValueChange,
    minimumTrackTintColor = theme.colors.primary,
    maximumTrackTintColor = theme.colors.surfaceVariant,
  } = props

  // Try expo-slider first, then @react-native-community/slider
  let SliderImpl: any = null
  try {
    const mod = require('expo-slider')
    SliderImpl = mod.Slider || mod.default || null
  } catch (e) {
    // ignore
  }
  if (!SliderImpl) {
    try {
      const mod = require('@react-native-community/slider')
      SliderImpl = mod.default || mod.Slider || null
    } catch (e) {
      // ignore
    }
  }

  if (SliderImpl) {
    return (
      <SliderImpl
        style={style}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={minimumTrackTintColor}
        maximumTrackTintColor={maximumTrackTintColor}
      />
    )
  }

  // Fallback UI: simple stepper with a visual track. Keeps the screen functional without slider libs.
  const decrease = () => {
    const next = Math.max(minimumValue, Math.round((value - step) / step) * step)
    onValueChange(next)
  }
  const increase = () => {
    const next = Math.min(maximumValue, Math.round((value + step) / step) * step)
    onValueChange(next)
  }
  const progress = (value - minimumValue) / Math.max(1, maximumValue - minimumValue)

  return (
    <View style={[styles.fallbackContainer, style]}>
      <View style={styles.headerRow}>
        <Pressable onPress={decrease} style={styles.stepButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.stepLabel}>−</Text>
        </Pressable>
        <Text style={styles.valueLabel}>{value}</Text>
        <Pressable onPress={increase} style={styles.stepButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.stepLabel}>+</Text>
        </Pressable>
      </View>
      <View style={styles.track}>
        <View style={[styles.filled, { width: `${Math.max(0, Math.min(1, progress)) * 100}%`, backgroundColor: minimumTrackTintColor }]} />
        <View style={[styles.remaining, { backgroundColor: maximumTrackTintColor }]} />
      </View>
      <Text style={styles.helperText}>Slider library not found. Using fallback.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fallbackContainer: {
    width: '100%',
    paddingVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceVariant,
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  valueLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  track: {
    marginTop: 8,
    width: '100%',
    height: 8,
    borderRadius: theme.radii.xs,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceVariant,
  },
  filled: {
    height: '100%',
  },
  remaining: {
    flex: 1,
    height: '100%',
  },
  helperText: {
    marginTop: 6,
    fontSize: 11,
    color: theme.colors.muted,
  },
})