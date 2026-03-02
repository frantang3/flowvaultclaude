// components/MediaPreview.tsx
import React, { useMemo, useRef, useState, useCallback } from 'react'
import { View, Image, StyleSheet, Pressable, Text } from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons'
import theme from '../lib/theme'

type Props = {
  videoUrl?: string | null
  imageUrl?: string | null
  thumbUrl?: string | null
  mode?: 'card' | 'details'
  moveId?: string
  onVideoAspectRatio?: (aspect: number) => void
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec < 10 ? '0' : ''}${sec}`
}

export default function MediaPreview({
  videoUrl,
  imageUrl,
  thumbUrl,
  mode = 'card',
  onVideoAspectRatio,
}: Props) {
  const videoRef = useRef<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [positionMillis, setPositionMillis] = useState(0)
  const [durationMillis, setDurationMillis] = useState(0)
  const [scrubberWidth, setScrubberWidth] = useState(0)

  const hasVideo = !!videoUrl
  const effectiveThumb = thumbUrl || imageUrl || null

  const containerStyle = mode === 'details' ? styles.detailsContainer : styles.cardContainer

  const videoSource = useMemo(() => {
    if (!videoUrl) return null
    return { uri: videoUrl }
  }, [videoUrl])

  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying)
      setPositionMillis(status.positionMillis || 0)
      setDurationMillis(status.durationMillis || 0)
      if (status.didJustFinish) {
        setIsPlaying(false)
      }
    }
  }, [])

  const togglePlayback = useCallback(async () => {
    if (!videoRef.current) return
    try {
      const status = await videoRef.current.getStatusAsync()
      if (status.isLoaded) {
        if (status.isPlaying) {
          await videoRef.current.pauseAsync()
        } else {
          if (status.didJustFinish || (status.durationMillis && status.positionMillis >= status.durationMillis - 100)) {
            await videoRef.current.replayAsync()
          } else {
            await videoRef.current.playAsync()
          }
        }
      } else {
        await videoRef.current.loadAsync(
          { uri: videoUrl! },
          { shouldPlay: true }
        )
      }
    } catch (err) {
      console.warn('Playback toggle error:', err)
    }
  }, [videoUrl])

  const handleScrub = useCallback(async (evt: any) => {
    if (!videoRef.current || scrubberWidth <= 0 || durationMillis <= 0) return
    const x = evt.nativeEvent.locationX
    const fraction = Math.max(0, Math.min(1, x / scrubberWidth))
    const seekTo = Math.floor(fraction * durationMillis)
    try {
      await videoRef.current.setPositionAsync(seekTo)
    } catch (err) {
      console.warn('Seek error:', err)
    }
  }, [scrubberWidth, durationMillis])

  const onScrubberLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    setScrubberWidth(e.nativeEvent.layout.width)
  }, [])

  if (!hasVideo && !effectiveThumb) {
    return (
      <View style={containerStyle}>
        <View style={[styles.media, styles.placeholder]}>
          <MaterialCommunityIcons name="image-off-outline" size={40} color={theme.colors.muted} />
        </View>
      </View>
    )
  }

  if (!hasVideo) {
    return (
      <View style={containerStyle}>
        <Image source={{ uri: effectiveThumb! }} style={styles.media} resizeMode="contain" />
      </View>
    )
  }

  const progress = durationMillis > 0 ? positionMillis / durationMillis : 0

  return (
    <View style={containerStyle}>
      <Video
        ref={videoRef}
        source={videoSource!}
        style={styles.media}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        isLooping={false}
        isMuted={mode !== 'details'}
        useNativeControls={false}
        usePoster={!!effectiveThumb}
        posterSource={effectiveThumb ? { uri: effectiveThumb } : undefined}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onError={(e: any) => console.warn('Video error:', e)}
        onReadyForDisplay={(e: any) => {
          const w = Number(e?.naturalSize?.width || 0)
          const h = Number(e?.naturalSize?.height || 0)
          if (w > 0 && h > 0) onVideoAspectRatio?.(w / h)
        }}
      />

      {mode === 'card' ? (
        /* Card mode: small floating play/pause button in bottom-right */
        <Pressable
          onPress={togglePlayback}
          style={styles.floatingPlayBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={22}
            color="#fff"
          />
        </Pressable>
      ) : (
        /* Details mode: full controls bar with play/pause, scrubber, time */
        <View style={styles.controlsBar}>
          <Pressable
            onPress={togglePlayback}
            style={styles.controlPlayBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={20}
              color="#fff"
            />
          </Pressable>

          <Text style={styles.timeText}>{formatTime(positionMillis)}</Text>

          <Pressable
            onPress={handleScrub}
            onLayout={onScrubberLayout}
            style={styles.scrubberTrack}
          >
            <View style={[styles.scrubberFill, { width: `${progress * 100}%` }]} />
            <View style={[styles.scrubberThumb, { left: `${progress * 100}%` }]} />
          </Pressable>

          <Text style={styles.timeText}>{formatTime(durationMillis)}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radii.sm,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  detailsContainer: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceVariant,
    overflow: 'hidden',
  },
  media: {
    width: '100%',
    flex: 1,
    backgroundColor: '#000',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Card mode: small circular play button */
  floatingPlayBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Details mode: full controls bar */
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  controlPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'center',
  },
  scrubberTrack: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  scrubberFill: {
    position: 'absolute',
    left: 0,
    top: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  scrubberThumb: {
    position: 'absolute',
    top: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -6,
  },
})