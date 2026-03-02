import React, { useEffect, useState, useMemo } from 'react'
import { useCallback } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import theme from '../lib/theme'
import PrimaryButton from '../components/PrimaryButton'
import { useMoves as useMovesQuery } from '../hooks/useMovesQuery'
import { useDistinctTags } from '../hooks/useDistinctTags'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { Move } from '../types/move'
import { useSubscription } from '../hooks/useSubscription'
import PaywallModal from '../components/PaywallModal'
import { useAuthActions } from '../hooks/useAuth'
import supabase from '../lib/supabase'
import { uploadMediaWithProgress } from '../lib/upload'

type StackParams = {
  MoveEdit: { mode: 'create' | 'edit'; id?: string }
}

export default function MoveEditScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const params = (route.params || {}) as any
  const mode: 'create' | 'edit' = params.mode || 'create'
  const editId: string | undefined = params.id

  const { user, uid } = useAuthActions()
  const { features, limits } = useSubscription()
  const { moves, createMove, updateMove } = useMovesQuery(uid)
  const { tagsWithFrequency } = useDistinctTags(uid)

  const existing = editId ? moves.find((m: Move) => m.id === editId) || null : null

  const [name, setName] = useState('')
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [showTagAutocomplete, setShowTagAutocomplete] = useState(false)
  const [manageTagsModalVisible, setManageTagsModalVisible] = useState(false)
  const [tagToRename, setTagToRename] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [notes, setNotes] = useState('')
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Uploaded URLs (stored in DB)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paywallVisible, setPaywallVisible] = useState(false)
  const [paywallFeature, setPaywallFeature] = useState<{ name: string; tier: string; description?: string }>({ name: '', tier: '' })

  // Check if user is over their move limit
  const moveCount = moves.length
  const isOverLimit = moveCount >= limits.maxMoves
  const isCreatingAndOverLimit = mode === 'create' && isOverLimit

  // Normalize tag: lowercase, trim, collapse multiple spaces
  const normalizeTag = React.useCallback((tag: string) => {
    return tag.toLowerCase().trim().replace(/\s+/g, ' ')
  }, [])

  // Check if tag already exists (normalized)
  const tagExists = React.useCallback((tag: string) => {
    const normalized = normalizeTag(tag)
    return tags.some((t: string) => normalizeTag(t) === normalized)
  }, [normalizeTag, tags])

  // Autocomplete suggestions based on input
  const tagAutocomplete = useMemo(() => {
    const input = tagInput.trim().toLowerCase()
    if (!input) return []

    return tagsWithFrequency
      .filter((t: { tag: string }) => {
        const normalized = normalizeTag(t.tag)
        return normalized.includes(input) && !tagExists(t.tag)
      })
      .slice(0, 5)
  }, [tagInput, tagsWithFrequency, normalizeTag, tagExists])

  useEffect(() => {
    setShowTagAutocomplete(tagAutocomplete.length > 0 && tagInput.length > 0)
  }, [tagAutocomplete, tagInput])

  useEffect(() => {
    navigation.setOptions({ headerShown: false })
  }, [navigation])

  // Show paywall immediately if trying to create while over limit
  useEffect(() => {
    if (isCreatingAndOverLimit) {
      const nextTier = features.TIER_FREE ? 'Mid' : features.TIER_MID ? 'Pro' : ''
      setPaywallFeature({
        name: 'Move Limit Reached',
        tier: nextTier,
        description: `You've reached the ${limits.tierName} plan limit of ${limits.maxMoves} moves. Upgrade to add more or delete some existing moves.`,
      })
      setPaywallVisible(true)
    }
  }, [isCreatingAndOverLimit, features, limits])

  const resetForm = () => {
    setName('')
    setDifficulty('Beginner')
    setTags([])
    setTagInput('')
    setNotes('')
    setVideoUri(null)
    setImageUri(null)
    setError(null)
  }

  // Initialize form for edit / create
  useEffect(() => {
    if (mode === 'create') {
      resetForm()
      return
    }

    if (mode === 'edit' && existing) {
      setName(existing.name || '')
      setDifficulty(existing.difficulty || 'Beginner')
      setTags(existing.tags || [])
      setNotes(existing.notes || '')
      setVideoUri(existing.videoUrl || null)
      setVideoUrl(existing.videoUrl || null)
      setImageUri(existing.imageUrl || null)
      setImageUrl(existing.imageUrl || null)
      setThumbUrl(existing.thumbUrl || null)
      setError(null)
    }
  }, [mode, editId, existing])

  const addTag = (tagToAdd?: string) => {
    const t = (tagToAdd || tagInput).trim()
    if (!t) return

    if (tagExists(t)) {
      Alert.alert('Duplicate tag', `"${t}" already exists (variations like case or spacing are considered duplicates).`)
      setTagInput('')
      setShowTagAutocomplete(false)
      return
    }

    setTags((prev: string[]) => [...prev, t])
    setTagInput('')
    setShowTagAutocomplete(false)
  }

  const removeTag = (t: string) => {
    const normalized = normalizeTag(t)
    setTags((prev: string[]) => prev.filter((x: string) => normalizeTag(x) !== normalized))
  }

  const addSuggestedTag = (t: string) => {
    if (tagExists(t)) return
    setTags((prev: string[]) => [...prev, t])
  }

  // Manage tags functions
  const handleRenameTag = (oldTag: string, newTag: string) => {
    const cleanNew = newTag.trim()
    if (!cleanNew) return

    if (normalizeTag(cleanNew) === normalizeTag(oldTag)) {
      // Just case/spacing change, allow it
      setTags((prev: string[]) => prev.map((t) => (normalizeTag(t) === normalizeTag(oldTag) ? cleanNew : t)))
    } else if (tagExists(cleanNew)) {
      Alert.alert('Duplicate tag', `"${cleanNew}" already exists.`)
    } else {
      setTags((prev: string[]) => prev.map((t) => (normalizeTag(t) === normalizeTag(oldTag) ? cleanNew : t)))
    }

    setTagToRename(null)
    setRenameInput('')
  }

  const handleDeleteTag = (tag: string) => {
    Alert.alert(
      'Delete tag?',
      `Remove "${tag}" from this move?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeTag(tag),
        },
      ]
    )
  }

  // Media pickers
  async function requestCameraPermissionsAsync() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    return status === 'granted'
  }

  async function requestMediaLibraryPermissionsAsync() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    return status === 'granted'
  }

  const getPickerAsset = (res: any): { uri: string; duration?: number | null } | null => {
    if (!res) return null
    const a = Array.isArray(res.assets) ? res.assets[0] : null
    const bestUri = a?.localUri || a?.uri
    if (typeof bestUri === 'string') return { uri: bestUri, duration: a.duration }
    if (typeof res.uri === 'string') return { uri: res.uri, duration: (res as any).duration }
    return null
  }

  const showMediaPaywall = () => {
    const tierRequired = features.TIER_FREE ? 'Mid or Pro' : 'Pro'
    setPaywallFeature({
      name: 'Media Upload',
      tier: tierRequired,
      description: 'Upload videos and images to your moves to better track your progress.',
    })
    setPaywallVisible(true)
  }

  const showLimitPaywall = () => {
    const nextTier = features.TIER_FREE ? 'Mid' : features.TIER_MID ? 'Pro' : ''
    setPaywallFeature({
      name: 'Move Limit Reached',
      tier: nextTier,
      description: `You've reached the ${limits.tierName} plan limit of ${limits.maxMoves} moves. Upgrade to add more or delete some existing moves.`,
    })
    setPaywallVisible(true)
  }

  const pickImage = async () => {
    if (!features.MEDIA_UPLOAD_ENABLED) {
      showMediaPaywall()
      return
    }
    try {
      const ok = await requestMediaLibraryPermissionsAsync()
      if (!ok) return Alert.alert('Permission required', 'Allow access to your photos to pick an image')
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
      if ((res as any).canceled || (res as any).cancelled) return
      const asset = getPickerAsset(res)
      if (!asset) throw new Error('Could not read selected image')
      setImageUri(asset.uri)
      setUploadError(null)
      await uploadImage(res)
    } catch (e: any) {
      console.warn(e)
      setUploadError(e?.message || 'Image selection failed')
    }
  }

  const takePhoto = async () => {
    if (!features.MEDIA_UPLOAD_ENABLED) {
      showMediaPaywall()
      return
    }
    try {
      const ok = await requestCameraPermissionsAsync()
      if (!ok) return Alert.alert('Permission required', 'Allow camera access to take a photo')
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
      if ((res as any).canceled || (res as any).cancelled) return
      const asset = getPickerAsset(res)
      if (!asset) throw new Error('Could not read captured image')
      setImageUri(asset.uri)
      setUploadError(null)
      await uploadImage(res)
    } catch (e: any) {
      console.warn(e)
      setUploadError(e?.message || 'Camera failed')
    }
  }

  const pickVideo = async () => {
    if (!features.MEDIA_UPLOAD_ENABLED) {
      showMediaPaywall()
      return
    }
    try {
      const ok = await requestMediaLibraryPermissionsAsync()
      if (!ok) return Alert.alert('Permission required', 'Allow access to your videos to pick a clip')
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.7 })
      if ((res as any).canceled || (res as any).cancelled) return
      const asset = getPickerAsset(res)
      if (!asset) throw new Error('Could not read selected video')
      if (asset.duration && asset.duration > 5 * 60 * 1000) {
        return Alert.alert('Video too long', 'Video must be under 5 minutes. Please trim it and try again.')
      }
      setVideoUri(asset.uri)
      setUploadError(null)
      await uploadVideo(res)
    } catch (e: any) {
      console.warn(e)
      setUploadError(e?.message || 'Video selection failed')
    }
  }

  const recordVideo = async () => {
    if (!features.MEDIA_UPLOAD_ENABLED) {
      showMediaPaywall()
      return
    }
    try {
      const ok = await requestCameraPermissionsAsync()
      if (!ok) return Alert.alert('Permission required', 'Allow camera access to record a video')
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.7 })
      if ((res as any).canceled || (res as any).cancelled) return
      const asset = getPickerAsset(res)
      if (!asset) throw new Error('Could not read recorded video')
      if (asset.duration && asset.duration > 5 * 60 * 1000) {
        return Alert.alert('Video too long', 'Video must be under 5 minutes. Please trim it and try again.')
      }
      setVideoUri(asset.uri)
      setUploadError(null)
      await uploadVideo(res)
    } catch (e: any) {
      console.warn(e)
      setUploadError(e?.message || 'Video recording failed')
    }
  }

  const uploadImage = async (fileOrPickerResult: any) => {
    setUploadingMedia(true)
    setUploadProgress(0)
    setUploadError(null)

    try {
      const result = await uploadMediaWithProgress('image', fileOrPickerResult, (progress) => {
        setUploadProgress(progress)
      }, uid)

      setImageUrl(result.publicUrl)
      setUploadProgress(100)
    } catch (e: any) {
      console.warn('Image upload failed:', e)
      let errorMsg = 'Image upload failed'
      if (e?.message) {
        if (e.message.includes('Unsupported') || e.message.includes('mime')) {
          errorMsg = 'Unsupported image format. Please use JPEG, PNG, or WebP.'
        } else if (e.message.includes('too large') || e.message.includes('size')) {
          errorMsg = 'Image too large. Maximum size is 5MB.'
        } else if (e.message.includes('Network') || e.message.includes('network')) {
          errorMsg = 'Network error. Check your connection and try again.'
        } else {
          errorMsg = e.message
        }
      }
      setUploadError(errorMsg)
      setImageUri(null)
      setImageUrl(null)
    } finally {
      setUploadingMedia(false)
    }
  }

  const uploadVideo = async (fileOrPickerResult: any) => {
    setUploadingMedia(true)
    setUploadProgress(0)
    setUploadError(null)

    try {
      const result = await uploadMediaWithProgress('video', fileOrPickerResult, (progress) => {
        setUploadProgress(progress)
      }, uid)

      setVideoUrl(result.publicUrl)
      setThumbUrl(result.thumbUrl || null)
      setUploadProgress(100)
    } catch (e: any) {
      console.warn('Video upload failed:', e)
      let errorMsg = 'Video upload failed'
      if (e?.message) {
        if (e.message.includes('Unsupported') || e.message.includes('mime')) {
          errorMsg = 'Unsupported video format. Please use MP4 or MOV.'
        } else if (e.message.includes('too large') || e.message.includes('size')) {
          errorMsg = 'Video too large. Maximum size is 50MB.'
        } else if (e.message.includes('duration') || e.message.includes('5 min') || e.message.includes('too long')) {
          errorMsg = 'Video too long. Maximum duration is 5 minutes.'
        } else if (e.message.includes('Network') || e.message.includes('network')) {
          errorMsg = 'Network error. Check your connection and try again.'
        } else {
          errorMsg = e.message
        }
      }
      setUploadError(errorMsg)
      setVideoUri(null)
      setVideoUrl(null)
      setThumbUrl(null)
    } finally {
      setUploadingMedia(false)
    }
  }

  const handleSave = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Please enter a name for this move')
      return
    }
    if (uploadingMedia) {
      setError('Please wait for media upload to complete')
      return
    }

    // Check move count limit for new moves
    if (mode === 'create') {
      if (isOverLimit) {
        showLimitPaywall()
        return
      }
      
      // Double-check with server count
      if (user?.id) {
        try {
          const { count, error: countError } = await supabase
            .from('moves')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)

          if (countError) throw countError

          if (count !== null && count >= limits.maxMoves) {
            showLimitPaywall()
            return
          }
        } catch (e) {
          console.warn('Failed to check move count:', e)
          setError('Failed to verify move limit — please try again')
          return
        }
      }
    }

    try {
      const payload = {
        name: name.trim(),
        difficulty,
        tags,
        notes: notes.trim() || null,
        videoUrl: videoUrl || null,
        imageUrl: imageUrl || null,
        thumbUrl: thumbUrl || null,
      }

      if (mode === 'create') {
        await createMove(payload)
      } else if (mode === 'edit' && editId) {
        await updateMove(editId, payload)
      }

      resetForm()
      Alert.alert(
        mode === 'create' ? 'Move created' : 'Move updated',
        'Your move was saved.',
        [{ text: 'OK', onPress: () => navigation.navigate('Library' as never) }]
      )
    } catch (e: any) {
      console.warn(e)
      setError(e?.message || 'Save failed — try again')
    }
  }

  const handleCancel = () => {
    resetForm()
    navigation.goBack()
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
          <Text style={styles.header}>{mode === 'create' ? 'Create Move' : 'Edit Move'}</Text>

          {/* Over Limit Banner */}
          {isCreatingAndOverLimit && (
            <Pressable style={styles.limitBanner} onPress={showLimitPaywall}>
              <MaterialCommunityIcons name="alert-circle" size={24} color={theme.colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.limitBannerTitle}>Move Limit Reached</Text>
                <Text style={styles.limitBannerText}>
                  You've used {moveCount}/{limits.maxMoves} moves on the {limits.tierName} plan. 
                  Tap to upgrade or delete some moves first.
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.error} />
            </Pressable>
          )}

          {/* Show usage bar */}
          {mode === 'create' && !isCreatingAndOverLimit && (
            <View style={styles.usageContainer}>
              <View style={styles.usageBar}>
                <View 
                  style={[
                    styles.usageProgress, 
                    { width: `${Math.min((moveCount / limits.maxMoves) * 100, 100)}%` },
                    moveCount >= limits.maxMoves * 0.8 && { backgroundColor: theme.colors.error }
                  ]} 
                />
              </View>
              <Text style={styles.usageText}>
                {moveCount} / {limits.maxMoves} moves used ({limits.tierName})
              </Text>
            </View>
          )}

          <Text style={styles.label}>Name</Text>
          <TextInput
            placeholder="Enter move name"
            value={name}
            onChangeText={setName}
            style={styles.input}
            returnKeyType="done"
            editable={!isCreatingAndOverLimit}
          />

          <Text style={styles.label}>Difficulty</Text>
          <View style={styles.row}>
            {(['Beginner', 'Intermediate', 'Advanced'] as Array<'Beginner' | 'Intermediate' | 'Advanced'>).map(d => (
              <Pressable 
                key={d} 
                onPress={() => !isCreatingAndOverLimit && setDifficulty(d)} 
                style={[styles.pill, difficulty === d && styles.pillActive, isCreatingAndOverLimit && { opacity: 0.5 }]}
              >
                <Text style={[styles.pillText, difficulty === d && styles.pillTextActive]}>{d}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Tags</Text>
            <Pressable onPress={() => setManageTagsModalVisible(true)} hitSlop={8}>
              <Text style={styles.manageTags}>Manage tags</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', position: 'relative' }}>
            <View style={{ flex: 1 }}>
              <TextInput 
                placeholder="Type to add or search..." 
                value={tagInput} 
                onChangeText={setTagInput}
                style={styles.input}
                onSubmitEditing={() => addTag()}
                editable={!isCreatingAndOverLimit}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {showTagAutocomplete && (
                <View style={styles.autocompleteDropdown}>
                  {tagAutocomplete.map((t: { tag: string; frequency: number }) => (
                    <Pressable
                      key={t.tag}
                      onPress={() => addTag(t.tag)}
                      style={styles.autocompleteItem}
                    >
                      <Text style={styles.autocompleteText}>{t.tag}</Text>
                      <Text style={styles.autocompleteFreq}>used in {t.frequency} {t.frequency === 1 ? 'move' : 'moves'}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <PrimaryButton 
              title="Add" 
              onPress={() => addTag()}
              style={{ paddingHorizontal: 14, paddingVertical: 8 }} 
              disabled={isCreatingAndOverLimit || !tagInput.trim()}
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {tags.map((t: string) => (
              <View key={t} style={styles.tagChip}>
                <Text style={styles.tagText}>{t}</Text>
                <Pressable onPress={() => removeTag(t)} style={styles.tagRemove}><Text style={{ color: '#fff' }}>×</Text></Pressable>
              </View>
            ))}
          </View>

          {tagsWithFrequency.length > 0 && !isCreatingAndOverLimit && (
            <>
              <Text style={[styles.label, { marginTop: 10 }]}>Your existing tags</Text>
              <Text style={styles.helperText}>Tap to add. Showing tags from your other moves.</Text>
              <View style={styles.suggestedWrap}>
                {tagsWithFrequency
                  .filter((t: { tag: string }) => !tagExists(t.tag))
                  .slice(0, 18)
                  .map((t: { tag: string; frequency: number }) => (
                    <Pressable key={t.tag} onPress={() => addSuggestedTag(t.tag)} style={styles.suggestedChip}>
                      <Text style={styles.suggestedText}>{t.tag}</Text>
                      <Text style={styles.suggestedCount}>{t.frequency}</Text>
                    </Pressable>
                  ))}
              </View>
            </>
          )}

          <Text style={[styles.label, { marginTop: 12 }]}>Notes (optional)</Text>
          <TextInput 
            placeholder="Notes about the move" 
            value={notes} 
            onChangeText={setNotes} 
            style={[styles.input, { height: 88, textAlignVertical: 'top' }]} 
            multiline 
            editable={!isCreatingAndOverLimit}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <Text style={styles.label}>Media</Text>
            {!features.MEDIA_UPLOAD_ENABLED && (
              <Pressable onPress={showMediaPaywall} hitSlop={8} style={{ marginLeft: 8 }}>
                <Text style={{ color: theme.colors.primary, fontSize: 12, textDecorationLine: 'underline' }}>
                  🔒 Upgrade to unlock
                </Text>
              </Pressable>
            )}
          </View>

          {/* Upload progress */}
          {uploadingMedia && (
            <View style={styles.uploadProgress}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>Uploading... {Math.round(uploadProgress)}%</Text>
            </View>
          )}

          {/* Upload error */}
          {uploadError && (
            <View style={styles.uploadError}>
              <MaterialCommunityIcons name="alert-circle" size={20} color={theme.colors.error} />
              <Text style={styles.uploadErrorText}>{uploadError}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={styles.mediaBlock}>
              <Text style={{ fontWeight: '700' }}>Video</Text>
              {videoUri ? (
                <View style={{ marginTop: 8 }}>
                  {thumbUrl ? (
                    <Image source={{ uri: thumbUrl }} style={styles.mediaPreview} />
                  ) : (
                    <View style={[styles.mediaPreview, { backgroundColor: theme.colors.surfaceVariant, alignItems: 'center', justifyContent: 'center' }]}>
                      <MaterialCommunityIcons name="video" size={40} color={theme.colors.muted} />
                    </View>
                  )}
                  <PrimaryButton 
                    title="Remove" 
                    onPress={() => { setVideoUri(null); setVideoUrl(null); setThumbUrl(null) }} 
                    style={{ marginTop: 8 }} 
                  />
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <PrimaryButton 
                    title={features.MEDIA_UPLOAD_ENABLED ? "Pick Video" : "🔒 Pick Video"} 
                    onPress={pickVideo}
                    style={(!features.MEDIA_UPLOAD_ENABLED || isCreatingAndOverLimit || uploadingMedia) ? { opacity: 0.6 } : undefined}
                    disabled={isCreatingAndOverLimit || uploadingMedia}
                  />
                  <PrimaryButton 
                    title={features.MEDIA_UPLOAD_ENABLED ? "Record Video" : "🔒 Record Video"} 
                    onPress={recordVideo} 
                    style={[{ marginTop: 8 }, (!features.MEDIA_UPLOAD_ENABLED || isCreatingAndOverLimit || uploadingMedia) ? { opacity: 0.6 } : undefined]}
                    disabled={isCreatingAndOverLimit || uploadingMedia}
                  />
                </View>
              )}
            </View>

            <View style={styles.mediaBlock}>
              <Text style={{ fontWeight: '700' }}>Image</Text>
              {imageUri ? (
                <View style={{ marginTop: 8 }}>
                  <Image source={{ uri: imageUri }} style={styles.mediaPreview} />
                  <PrimaryButton 
                    title="Remove" 
                    onPress={() => { setImageUri(null); setImageUrl(null) }} 
                    style={{ marginTop: 8 }} 
                  />
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <PrimaryButton 
                    title={features.MEDIA_UPLOAD_ENABLED ? "Pick Image" : "🔒 Pick Image"} 
                    onPress={pickImage}
                    style={(!features.MEDIA_UPLOAD_ENABLED || isCreatingAndOverLimit || uploadingMedia) ? { opacity: 0.6 } : undefined}
                    disabled={isCreatingAndOverLimit || uploadingMedia}
                  />
                  <PrimaryButton 
                    title={features.MEDIA_UPLOAD_ENABLED ? "Take Photo" : "🔒 Take Photo"} 
                    onPress={takePhoto} 
                    style={[{ marginTop: 8 }, (!features.MEDIA_UPLOAD_ENABLED || isCreatingAndOverLimit || uploadingMedia) ? { opacity: 0.6 } : undefined]}
                    disabled={isCreatingAndOverLimit || uploadingMedia}
                  />
                </View>
              )}
            </View>
          </View>

          {error ? <Text style={{ color: '#e24444', marginTop: 8 }}>{error}</Text> : null}

          <View style={{ marginTop: 18 }}>
            {isCreatingAndOverLimit ? (
              <PrimaryButton 
                title="Upgrade to Create More Moves" 
                onPress={showLimitPaywall}
                style={{ backgroundColor: theme.colors.primary }}
              />
            ) : (
              <PrimaryButton 
                title={mode === 'create' ? 'Create Move' : 'Save Changes'} 
                onPress={handleSave} 
                disabled={!name.trim() || uploadingMedia} 
              />
            )}
            <PrimaryButton 
              title="Cancel" 
              onPress={handleCancel} 
              style={{ backgroundColor: theme.colors.surfaceVariant, marginTop: 10 }} 
              titleStyle={{ color: theme.colors.text }} 
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Manage Tags Modal */}
      <Modal visible={manageTagsModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Manage Tags</Text>
            <Pressable onPress={() => setManageTagsModalVisible(false)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent}>
            {tags.length === 0 ? (
              <Text style={styles.noTagsText}>No tags on this move yet. Add some above!</Text>
            ) : (
              tags.map((tag: string) => (
                <View key={tag} style={styles.manageTagRow}>
                  {tagToRename === tag ? (
                    <View style={styles.renameRow}>
                      <TextInput
                        value={renameInput}
                        onChangeText={setRenameInput}
                        style={styles.renameInput}
                        autoFocus
                        placeholder="New tag name"
                      />
                      <Pressable onPress={() => handleRenameTag(tag, renameInput)} style={styles.renameSave}>
                        <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => { setTagToRename(null); setRenameInput('') }} style={styles.renameCancel}>
                        <MaterialCommunityIcons name="close" size={20} color={theme.colors.muted} />
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.manageTagText}>{tag}</Text>
                      <View style={styles.manageTagActions}>
                        <Pressable onPress={() => { setTagToRename(tag); setRenameInput(tag) }} hitSlop={8}>
                          <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.primary} />
                        </Pressable>
                        <Pressable onPress={() => handleDeleteTag(tag)} hitSlop={8}>
                          <MaterialCommunityIcons name="delete" size={20} color={theme.colors.error} />
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        featureName={paywallFeature.name}
        tierRequired={paywallFeature.tier}
        description={paywallFeature.description}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  container: { padding: theme.spacing.md, paddingBottom: 40 },
  header: { 
    fontSize: theme.type.h2, 
    fontWeight: '800', 
    marginBottom: 12, 
    color: theme.colors.text,
    ...theme.fonts.heading,
  },
  label: { 
    color: theme.colors.muted, 
    marginTop: 6,
    fontWeight: '600',
    ...theme.fonts.bodySemiBold,
  },
  input: { 
    backgroundColor: theme.colors.surface, 
    padding: 12, 
    borderRadius: theme.radii.sm, 
    marginTop: 8,
    color: theme.colors.text,
    ...theme.fonts.body,
  },
  row: { flexDirection: 'row', marginTop: 8 },
  pill: { 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 24, 
    backgroundColor: theme.colors.surfaceVariant, 
    marginRight: 8 
  },
  pillActive: { backgroundColor: theme.colors.primary },
  pillText: { 
    color: theme.colors.text,
    ...theme.fonts.bodySemiBold,
  },
  pillTextActive: { color: theme.colors.onPrimary },
  tagChip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: theme.colors.primary, 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 20, 
    marginRight: 8, 
    marginTop: 8 
  },
  tagText: { 
    color: '#fff', 
    marginRight: 8,
    fontWeight: '600',
    ...theme.fonts.bodySemiBold,
  },
  tagRemove: { 
    backgroundColor: 'rgba(0,0,0,0.15)', 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 12 
  },
  mediaBlock: { flex: 1 },
  mediaPreview: { 
    width: 140, 
    height: 96, 
    borderRadius: 8, 
    marginTop: 8, 
    backgroundColor: theme.colors.surfaceVariant 
  },
  suggestedWrap: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8, 
    marginTop: 8 
  },
  suggestedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  suggestedText: { 
    color: theme.colors.text, 
    fontWeight: '700',
    ...theme.fonts.bodySemiBold,
  },
  suggestedCount: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.muted,
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    ...theme.fonts.number,
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.error + '15',
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.error + '30',
  },
  limitBannerTitle: {
    fontSize: theme.type.body,
    fontWeight: '800',
    color: theme.colors.error,
    ...theme.fonts.heading,
  },
  limitBannerText: {
    fontSize: theme.type.small,
    color: theme.colors.error,
    marginTop: 2,
    lineHeight: 18,
    ...theme.fonts.body,
  },
  usageContainer: {
    marginBottom: theme.spacing.md,
  },
  usageBar: {
    height: 6,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 3,
    overflow: 'hidden',
  },
  usageProgress: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 3,
  },
  usageText: {
    fontSize: theme.type.small,
    color: theme.colors.muted,
    marginTop: 4,
    ...theme.fonts.number,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  manageTags: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
    ...theme.fonts.bodySemiBold,
  },
  helperText: {
    fontSize: 11,
    color: theme.colors.muted,
    marginTop: 2,
    fontStyle: 'italic',
    ...theme.fonts.body,
  },
  autocompleteDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: theme.radii.md,
    marginTop: 4,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  autocompleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  autocompleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    ...theme.fonts.bodySemiBold,
  },
  autocompleteFreq: {
    fontSize: 11,
    color: theme.colors.muted,
    ...theme.fonts.body,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
    ...theme.fonts.heading,
  },
  modalContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  noTagsText: {
    color: theme.colors.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
    ...theme.fonts.body,
  },
  manageTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  manageTagText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
    ...theme.fonts.bodySemiBold,
  },
  manageTagActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  renameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  renameInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: theme.radii.md,
    padding: 10,
    color: theme.colors.text,
    ...theme.fonts.body,
  },
  renameSave: {
    padding: 4,
  },
  renameCancel: {
    padding: 4,
  },
  uploadProgress: {
    marginTop: 12,
    padding: 12,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: theme.radii.md,
  },
  progressBar: {
    height: 6,
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 3,
  },
  progressText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
    textAlign: 'center',
    ...theme.fonts.bodySemiBold,
  },
  uploadError: {
    marginTop: 12,
    padding: 12,
    backgroundColor: theme.colors.error + '10',
    borderRadius: theme.radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadErrorText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.error,
    lineHeight: 18,
    ...theme.fonts.body,
  },
})