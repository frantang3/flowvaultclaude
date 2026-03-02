import { useRef } from 'react'
import { Animated } from 'react-native'

export const useScalePress = (scaleTo = 1.05) => {
  const scaleAnim = useRef(new Animated.Value(1)).current

  const animateIn = () => {
    Animated.spring(scaleAnim, {
      toValue: scaleTo,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start()
  }

  const animateOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start()
  }

  return {
    scaleAnim,
    animateIn,
    animateOut,
  }
}