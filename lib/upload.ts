// lib/upload.ts
// Cross-platform media upload for Supabase Storage with progress tracking
// Uses Edge Function 'sign-upload' for RLS-compliant signed URLs
// Handles web File/Blob, file://, content://, ph://, data:, and blob: URIs
import { Platform } from 'react-native'
import supabase from './supabase'

const IS_DEV = (globalThis as any).__DEV__ === true

// Add: optional type for extended asset conversion result
type UploadProgress = (percent: number) => void

function extFromMime(mime: string | null) {
  if (!mime) return ''
  const parts = mime.split('/')
  return parts[1] || ''
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9)
}

function formatDate(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Limits
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024 // 50MB
const MAX_VIDEO_MS = 5 * 60 * 1000 // 5 minutes
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp']

// Convert expo-image-picker result or raw URI/File/Blob into a Blob
// EDIT: return originalUri so native thumbnail generation can use local files
async function convertAssetToBlob(asset: any): Promise<{ blob: Blob; mime: string; ext: string; size: number; name?: string | null; originalUri?: string | null }> {
  let blob: Blob | null = null
  let mime: string | null = null
  let name: string | null = null
  let originalUri: string | null = null

  // Web: Check if asset is a File or Blob directly
  if (Platform.OS === 'web') {
    const g: any = globalThis as any
    if (asset instanceof g.File) {
      blob = asset
      mime = (asset as File).type || null
      name = (asset as File).name || null
    } else if (asset instanceof g.Blob) {
      blob = asset
      mime = (asset as Blob).type || null
    }
  }

  // Helper to extract URI from various picker result formats
  const extractAssetInfo = (pickerResult: any): { uri: string | null; mimeType: string | null; fileName: string | null; assetId: string | null } => {
    // Standard expo-image-picker format: { assets: [{ uri, mimeType, fileName }] }
    if (Array.isArray(pickerResult?.assets) && pickerResult.assets.length > 0) {
      const a = pickerResult.assets[0]
      return {
        uri: a.localUri || a.uri || null,
        mimeType: a.mimeType || a.type || null,
        fileName: a.fileName || a.name || null,
        assetId: a.assetId || a.id || null,
      }
    }
    // Legacy format: { uri, type, fileName }
    if (typeof pickerResult?.uri === 'string') {
      return {
        uri: pickerResult.uri,
        mimeType: pickerResult.mimeType || pickerResult.type || null,
        fileName: pickerResult.fileName || pickerResult.name || null,
        assetId: pickerResult.assetId || pickerResult.id || null,
      }
    }
    // Direct asset object: { uri, mimeType, fileName }
    if (pickerResult && typeof pickerResult === 'object') {
      const uri = pickerResult.uri || pickerResult.localUri || null
      if (uri) {
        return {
          uri,
          mimeType: pickerResult.mimeType || pickerResult.type || null,
          fileName: pickerResult.fileName || pickerResult.name || null,
          assetId: pickerResult.assetId || pickerResult.id || null,
        }
      }
    }
    return { uri: null, mimeType: null, fileName: null, assetId: null }
  }

  // Expo-image-picker result: { assets: [{ uri, fileName, mimeType, fileSize, duration }] }
  if (!blob && asset && typeof asset === 'object') {
    const extracted = extractAssetInfo(asset)
    const extractedUri = extracted.uri
    mime = extracted.mimeType
    name = extracted.fileName
    const extractedAssetId: string | null = extracted.assetId

    if (typeof extractedUri === 'string' && extractedUri.length > 0) {
      let uriStr: string = extractedUri
      originalUri = extractedUri
      // iPhone HEIC → convert to JPEG for broad compatibility
      const isHeic = (mime && mime.toLowerCase() === 'image/heic') || (name && name.toLowerCase().endsWith('.heic'))
      if (isHeic) {
        try {
          const ImageManipulator = await import('expo-image-manipulator')
          const out = await (ImageManipulator as any).manipulateAsync(uriStr, [], {
            compress: 0.9,
            format: (ImageManipulator as any).SaveFormat.JPEG,
          })
          const nextUri = out?.uri
          if (typeof nextUri === 'string' && nextUri.length > 0) {
            uriStr = nextUri
            originalUri = nextUri
          }
          mime = 'image/jpeg'
          if (name) name = name.replace(/\.heic$/i, '.jpg')
        } catch (convErr) {
          console.warn('[upload] HEIC→JPEG conversion failed, attempting original HEIC upload', convErr)
          // Continue with original uri/mime; validation will catch unsupported format later
        }
      }

      // Convert URI to blob
      try {
        blob = await uriToBlob(uriStr, mime, extractedAssetId)
      } catch (uriErr) {
        console.warn('[upload] uriToBlob failed for:', uriStr, uriErr)
        // Try alternative extraction methods
      }
    }
  }

  // If asset is just a string URI
  if (!blob && typeof asset === 'string') {
    originalUri = asset
    try {
      blob = await uriToBlob(asset, null)
    } catch (uriErr) {
      console.warn('[upload] string URI conversion failed:', asset, uriErr)
    }
  }

  if (!blob) {
    // Provide more helpful error message
    const assetType = typeof asset
    const hasAssets = Array.isArray(asset?.assets)
    const hasUri = typeof asset?.uri === 'string'
    const extractedLocalUri = Array.isArray(asset?.assets) ? asset?.assets?.[0]?.localUri : null
    const extractedUri = Array.isArray(asset?.assets) ? asset?.assets?.[0]?.uri : asset?.uri
    const scheme = typeof extractedUri === 'string' ? extractedUri.split(':')[0] : 'unknown'
    throw new Error(
      `Failed to derive blob from output. ` +
      `Asset type: ${assetType}, hasAssets: ${hasAssets}, hasUri: ${hasUri}, uriScheme: ${scheme}, hasLocalUri: ${typeof extractedLocalUri === 'string'}. ` +
      `Please try selecting the file again.`
    )
  }

  // Infer extension from mime or filename; if unknown, leave blank for caller to decide
  let ext = extFromMime(mime)
  if ((!ext || ext === 'octet-stream') && name) {
    const parts = name.split('.')
    ext = parts.length > 1 ? (parts.pop() || '').toLowerCase() : ''
  }

  const size = (blob as any).size || 0

  return { blob, mime: mime || 'application/octet-stream', ext: (ext || '').toLowerCase(), size, name, originalUri }
}

// Convert various URI formats to Blob (cross-platform)
async function uriToBlob(uri: string, mimeHint: string | null, assetIdHint?: string | null): Promise<Blob> {
  const uriScheme = uri.split(':')[0] || 'unknown'
  const g: any = globalThis as any

  if (IS_DEV) console.log(`[upload] platform=${Platform.OS} uriScheme=${uriScheme} → converting to blob`)

  // Web: data:, blob:, http/https:
  if (Platform.OS === 'web') {
    if (uri.startsWith('data:')) {
      const res = await g.fetch(uri)
      const blob = await res.blob()
      if (IS_DEV) console.log(`[upload] data: URI → blob size=${(blob.size / 1024).toFixed(1)}KB type=${blob.type}`)
      return blob
    }
    if (uri.startsWith('blob:') || uri.startsWith('http://') || uri.startsWith('https://')) {
      const res = await g.fetch(uri)
      const blob = await res.blob()
      if (IS_DEV) console.log(`[upload] ${uriScheme}: URI → blob size=${(blob.size / 1024).toFixed(1)}KB type=${blob.type}`)
      return blob
    }
  }

  // Native: handle data: URIs by writing to a temp file then fetching
  if (Platform.OS !== 'web' && uri.startsWith('data:')) {
    try {
      const FileSystem = await import('expo-file-system')
      const match = uri.match(/^data:(.*?);base64,(.*)$/)
      if (!match) throw new Error('Invalid data URI')
      const mime = match[1] || mimeHint || 'application/octet-stream'
      const base64 = match[2]
      const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'bin'
      const dest = `${(FileSystem as any).cacheDirectory || ''}inline-${Date.now()}-${randomSuffix()}.${ext}`
      await (FileSystem as any).writeAsStringAsync(dest, base64, { encoding: (FileSystem as any).EncodingType?.Base64 || 'base64' })
      const res = await g.fetch(dest)
      const blob = await res.blob()
      if (IS_DEV) console.log(`[upload] data: -> file cache ${dest} → blob size=${(blob.size / 1024).toFixed(1)}KB type=${blob.type}`)
      return blob
    } catch (e) {
      console.warn('[upload] native data: handling failed', e)
      // Try direct fetch as a last resort
      const res = await g.fetch(uri)
      const blob = await res.blob()
      return blob
    }
  }

  // iOS/Android: file://, content://, ph://
  if (uri.startsWith('file://')) {
    try {
      const res = await g.fetch(uri)
      const blob = await res.blob()
      if (IS_DEV) console.log(`[upload] file: URI → blob size=${(blob.size / 1024).toFixed(1)}KB type=${blob.type}`)
      return blob
    } catch (e) {
      if (IS_DEV) console.log(`[upload] file: fetch failed, trying FileSystem fallback`)
      return await base64ToBlob(uri, mimeHint)
    }
  }

  if (uri.startsWith('content://')) {
    if (IS_DEV) console.log(`[upload] Android content: URI → attempting direct fetch first`)
    try {
      const res = await g.fetch(uri)
      const blob = await res.blob()
      if (IS_DEV) console.log(`[upload] content: fetch → blob size=${(blob.size / 1024).toFixed(1)}KB type=${blob.type}`)
      return blob
    } catch (e) {
      if (IS_DEV) console.log(`[upload] content: fetch failed, trying FileSystem fallback copy`)
      try {
        const FileSystem = await import('expo-file-system')
        const dest = `${(FileSystem as any).cacheDirectory || ''}content-${Date.now()}-${randomSuffix()}`
        await (FileSystem as any).copyAsync?.({ from: uri, to: dest })
        const res = await g.fetch(dest)
        const blob = await res.blob()
        if (IS_DEV) console.log(`[upload] content: copied to cache → blob size=${(blob.size / 1024).toFixed(1)}KB`)
        return blob
      } catch (copyErr) {
        console.warn('[upload] content: copy fallback failed', copyErr)
        return await base64ToBlob(uri, mimeHint)
      }
    }
  }

  if (uri.startsWith('ph://')) {
    if (IS_DEV) console.log(`[upload] iOS ph: URI → resolving via MediaLibrary`)
    try {
      const MediaLibrary = await import('expo-media-library')
      
      // Ensure permission (ImagePicker permission is not always sufficient for MediaLibrary APIs).
      const perm = await (MediaLibrary as any).getPermissionsAsync?.()
      if (!perm?.granted) {
        const req = await (MediaLibrary as any).requestPermissionsAsync?.()
        if (!req?.granted) {
          throw new Error('Permission required: Please allow photo library access to upload this media.')
        }
      }

      const derivedIdFromUri = (() => {
        const tail = uri.slice('ph://'.length)
        // Some iOS URIs include extra segments or query params.
        return tail.split('?')[0].split('/')[0]
      })()
      const assetId = assetIdHint || derivedIdFromUri

      const assetInfo = await (MediaLibrary as any).getAssetInfoAsync(assetId)
      if (assetInfo && assetInfo.localUri) {
        const res = await g.fetch(assetInfo.localUri)
        const blob = await res.blob()
        if (IS_DEV) console.log(`[upload] ph: resolved → blob size=${(blob.size / 1024).toFixed(1)}KB`)
        return blob
      }
      throw new Error('Could not resolve ph:// asset')
    } catch (e) {
      console.warn('Failed to resolve ph:// URI', e)
      throw e
    }
  }

  // Fallback: try direct fetch
  try {
    const res = await g.fetch(uri)
    const blob = await res.blob()
    if (IS_DEV) console.log(`[upload] fallback fetch → blob size=${(blob.size / 1024).toFixed(1)}KB type=${blob.type}`)
    return blob
  } catch (e) {
    throw new Error(`Unsupported URI format: ${uri}`)
  }
}

// Read file as base64 and convert to Blob
async function base64ToBlob(uri: string, mimeHint: string | null): Promise<Blob> {
  try {
    const FileSystem = await import('expo-file-system')
    const base64 = await (FileSystem as any).readAsStringAsync(uri, {
      encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
    })
    
    // Infer mime from URI extension if not provided
    let mime = mimeHint
    if (!mime) {
      const lower = uri.toLowerCase()
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg'
      else if (lower.endsWith('.png')) mime = 'image/png'
      else if (lower.endsWith('.webp')) mime = 'image/webp'
      else if (lower.endsWith('.mp4')) mime = 'video/mp4'
      else if (lower.endsWith('.mov')) mime = 'video/quicktime'
      else mime = 'application/octet-stream'
    }
    
    const dataUrl = `data:${mime};base64,${base64}`
    const g: any = globalThis as any
    const res = await g.fetch(dataUrl)
    return await res.blob()
  } catch (e) {
    console.warn('base64ToBlob failed', e)
    throw e
  }
}

// Helper: generate a video thumbnail blob cross-platform from a local source
async function createVideoThumbnailBlob(localSource: { originalUri?: string | null; blob?: Blob | null }): Promise<{ blob: Blob; mime: string; ext: string } | null> {
  try {
    if (Platform.OS === 'web') {
      if (!localSource.blob) return null
      const g: any = globalThis as any
      const objectUrl = g.URL.createObjectURL(localSource.blob)
      const blob = await new Promise<Blob | null>((resolve) => {
        const doc: any = (globalThis as any).document
        const video = doc.createElement('video')
        video.crossOrigin = 'anonymous'
        video.muted = true
        video.playsInline = true
        video.preload = 'metadata'
        video.src = objectUrl
        video.onloadedmetadata = () => {
          video.currentTime = 0.1
        }
        video.onseeked = () => {
          try {
            const canvas = doc.createElement('canvas')
            canvas.width = video.videoWidth || 480
            canvas.height = video.videoHeight || 270
            const ctx = canvas.getContext('2d')
            if (!ctx) return resolve(null)
            ctx.drawImage(video, 0, 0)
            canvas.toBlob((b: any) => resolve(b), 'image/jpeg', 0.8)
          } catch (err) {
            console.warn('[media] web thumbnail generation failed', err)
            resolve(null)
          } finally {
            g.URL.revokeObjectURL(objectUrl)
            video.remove()
          }
        }
        video.onerror = () => {
          console.warn('[media] web video load failed for thumbnail')
          g.URL.revokeObjectURL(objectUrl)
          video.remove()
          resolve(null)
        }
      })
      if (!blob) return null
      return { blob, mime: 'image/jpeg', ext: 'jpg' }
    } else {
      // Native: use expo-video-thumbnails on the local URI
      const sourceUri = localSource.originalUri || null
      if (!sourceUri) return null
      const VideoThumbnails = await import('expo-video-thumbnails')
      const { uri } = await (VideoThumbnails as any).getThumbnailAsync(sourceUri, { time: 100 })
      const g: any = globalThis as any
      const res = await g.fetch(uri)
      const blob = await res.blob()
      return { blob, mime: 'image/jpeg', ext: 'jpg' }
    }
  } catch (err) {
    console.warn('[media] thumbnail generation failed', err)
    return null
  }
}

// Main upload function with progress
export async function uploadMediaWithProgress(
  kind: 'image' | 'video',
  fileOrUri: any,
  onProgress?: UploadProgress,
  userId?: string
): Promise<{ publicUrl: string; path: string; contentType: string; size: number; kind: 'image' | 'video'; thumbUrl?: string }> {
  // 1. Auth check — prefer session (local) then getUser (network)
  let uid: string | undefined = userId
  let token: string | undefined
  try {
    if ((supabase.auth as any).getSession) {
      const sess = await (supabase.auth as any).getSession()
      uid = sess?.data?.session?.user?.id || uid
      token = sess?.data?.session?.access_token
    }
  } catch {}
  if (!uid) {
    try {
      const userResp: any = await (supabase.auth.getUser ? supabase.auth.getUser() : Promise.resolve({ data: { user: null } }))
      const user = userResp?.data?.user || null
      uid = user?.id
    } catch {}
  }
  
  if (!uid || !token) {
    throw new Error('Please sign in to upload media.')
  }

  // 2. Convert to Blob
  const { blob, mime, ext, size, name, originalUri } = await convertAssetToBlob(fileOrUri)

  // 3. Validate mime type for images (after HEIC→JPEG conversion if applicable)
  if (kind === 'image' && !ALLOWED_IMAGE_MIMES.includes(mime)) {
    throw new Error('Unsupported image format. Please use JPEG, PNG or WebP.')
  }

  // 4. Size guards
  if (kind === 'image' && size > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (${(size / 1024 / 1024).toFixed(1)}MB). Max 5 MB.`)
  }
  if (kind === 'video' && size > MAX_VIDEO_BYTES) {
    throw new Error(`Video too large (${(size / 1024 / 1024).toFixed(1)}MB). Max 50 MB.`)
  }

  // 5. Determine extension and content type
  let finalExt = (ext || '').toLowerCase()
  let finalMime = mime

  // Detect QuickTime/MOV explicitly from mime or filename
  const nameLower = (name || '').toLowerCase()
  const isQuickTime = (finalMime || '').toLowerCase() === 'video/quicktime' || finalExt === 'mov' || nameLower.endsWith('.mov')

  // Explicit platform guard: block QuickTime/MOV on Android and Web (cannot play reliably)
  if (kind === 'video') {
    if (isQuickTime && (Platform.OS === 'android' || Platform.OS === 'web')) {
      throw new Error('MOV videos are not supported on this platform. Please upload an MP4 file.')
    }
  }

  if (kind === 'image') {
    if (!finalExt) {
      if (finalMime === 'image/jpeg') finalExt = 'jpg'
      else if (finalMime === 'image/png') finalExt = 'png'
      else if (finalMime === 'image/webp') finalExt = 'webp'
      else finalExt = 'jpg'
    }
    if (!ALLOWED_IMAGE_MIMES.includes(finalMime)) {
      finalMime = finalExt === 'png' ? 'image/png' : finalExt === 'webp' ? 'image/webp' : 'image/jpeg'
    }
  } else {
    // video: preserve MOV if detected, otherwise default to MP4
    if (isQuickTime) {
      finalExt = 'mov'
      finalMime = 'video/quicktime'
    } else {
      if (!finalExt || finalExt === 'octet-stream' || finalExt === 'jpg' || finalExt === 'jpeg' || finalExt === 'png' || finalExt === 'webp') {
        finalExt = 'mp4'
      }
      if (!finalMime || !finalMime.startsWith('video/')) {
        finalMime = 'video/mp4'
      }
    }
  }

  if (onProgress) onProgress(5)

  // 6. Get SUPABASE_URL from environment
  const g: any = globalThis as any
  const SUPABASE_URL = g.SUPABASE_URL
  if (!SUPABASE_URL) throw new Error('Supabase URL not configured. Check your environment setup.')

  // 7. Try Edge Function for signed upload first
  let uploadMethod: 'signed' | 'direct' = 'signed'
  let signedUrl: string | null = null
  let objectName: string | null = null
  let contentType: string = finalMime

  if (IS_DEV) console.log(`[upload] requesting signed URL for kind=${kind} ext=${finalExt}`)

  try {
    const signRes = await (globalThis as any).fetch(`${SUPABASE_URL}/functions/v1/sign-upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kind, ext: finalExt, contentType: finalMime }),
    })

    if (signRes.ok) {
      const data = await signRes.json()
      signedUrl = data.signedUrl
      objectName = data.objectName
      contentType = data.contentType || finalMime
      if (IS_DEV) console.log(`[upload] signed URL obtained, path=${objectName}`)
    } else if (signRes.status === 404) {
      if (IS_DEV) console.log('[upload] sign-upload Edge Function not found (404), falling back to direct upload')
      uploadMethod = 'direct'
    } else {
      const errText = await signRes.text().catch(() => signRes.statusText)
      throw new Error(`Upload failed (HTTP ${signRes.status}): ${errText}`)
    }
  } catch (err: any) {
    if (err.message && err.message.includes('HTTP')) {
      throw err
    }
    if (IS_DEV) console.log('[upload] sign-upload request failed (network error), falling back to direct upload:', err.message)
    uploadMethod = 'direct'
  }

  if (onProgress) onProgress(10)

  // 8a. SIGNED UPLOAD: PUT the Blob to the signed URL using XMLHttpRequest
  if (uploadMethod === 'signed' && signedUrl && objectName) {
    if (IS_DEV) console.log(`[upload] uploading ${kind} via signed URL path=${objectName} size=${(size / 1024).toFixed(1)}KB`)

    await new Promise<void>((resolve, reject) => {
      const xhr = new (globalThis as any).XMLHttpRequest()
      
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100) || 0
          onProgress(10 + Math.floor(percent * 0.7))
        }
      }
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (IS_DEV) console.log(`[upload] PUT succeeded ${xhr.status}`)
          resolve()
        } else {
          console.warn(`[upload] PUT failed ${xhr.status}`)
          reject(new Error(`Upload failed (HTTP ${xhr.status}): ${xhr.statusText || 'Unknown error'}`))
        }
      }

      xhr.onerror = () => {
        console.warn('[upload] PUT network error')
        reject(new Error('Upload failed: Network error'))
      }

      xhr.open('PUT', signedUrl, true)
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.send(blob)
    })
  } 
  // 8b. DIRECT UPLOAD
  else {
    if (IS_DEV) console.log('[upload] using direct upload to supabase.storage')
    
    // Generate objectName matching RLS policy: {uid}/{YYYY-MM-DD}/{timestamp}-{random}.{ext}
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    objectName = `${uid}/${yyyy}-${mm}-${dd}/${ts}-${rand}.${finalExt}`

    if (IS_DEV) console.log(`[upload] direct upload path=${objectName} contentType=${contentType}`)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('moves')
      .upload(objectName, blob, { contentType })

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    if (IS_DEV) console.log('[upload] direct upload succeeded')

    if (onProgress) onProgress(80)
  }

  if (onProgress) onProgress(80)

  // 9. Get public URL for main media
  if (!objectName) {
    throw new Error('Upload failed: No object name available')
  }

  const { data: urlData } = supabase.storage.from('moves').getPublicUrl(objectName)
  const publicUrl = (urlData && (urlData as any).publicUrl) || ''

  if (!publicUrl) throw new Error('Public URL not available')

  if (onProgress) onProgress(90)

  // 10. Generate and upload video thumbnail (if video)
  let thumbUrl: string | undefined
  if (kind === 'video') {
    const thumbBlob = await createVideoThumbnailBlob({ originalUri, blob })
    if (thumbBlob) {
      try {
        // Try signed upload for thumbnail
        const thumbSignRes = await (globalThis as any).fetch(`${SUPABASE_URL}/functions/v1/sign-upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ kind: 'image', ext: thumbBlob.ext, contentType: thumbBlob.mime }),
        })

        if (thumbSignRes.ok) {
          const { signedUrl: thumbSignedUrl, objectName: thumbObjectName, contentType: thumbContentType } = await thumbSignRes.json()

          await new Promise<void>((resolve, reject) => {
            const xhr = new (globalThis as any).XMLHttpRequest()
            xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Thumbnail PUT failed (HTTP ${xhr.status})`))
            xhr.onerror = () => reject(new Error('Thumbnail upload: Network error'))
            xhr.open('PUT', thumbSignedUrl, true)
            xhr.setRequestHeader('Content-Type', thumbContentType || thumbBlob.mime)
            xhr.send(thumbBlob.blob)
          })

          const { data: thumbUrlData } = supabase.storage.from('moves').getPublicUrl(thumbObjectName)
          thumbUrl = (thumbUrlData && (thumbUrlData as any).publicUrl) || undefined
        } else {
          // Fallback to direct upload for thumbnail
          const d = new Date()
          const yyyy = d.getFullYear()
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')

          const thumbObjectName = `${uid}/${yyyy}-${mm}-${dd}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${thumbBlob.ext}`
          const { error: thumbUploadError } = await supabase.storage
            .from('moves')
            .upload(thumbObjectName, thumbBlob.blob, { contentType: thumbBlob.mime })

          if (!thumbUploadError) {
            const { data: thumbUrlData } = supabase.storage.from('moves').getPublicUrl(thumbObjectName)
            thumbUrl = (thumbUrlData && (thumbUrlData as any).publicUrl) || undefined
          }
        }
      } catch (thumbErr) {
        console.warn('[upload] thumbnail upload failed', thumbErr)
      }
    } else {
      console.log('[upload] thumbnail generation returned null')
    }
  }

  if (onProgress) onProgress(100)

  if (IS_DEV) console.log('[upload] ✓ success')

  return { publicUrl, path: objectName, contentType, size, kind, thumbUrl }
}

// Legacy export for backward compatibility
export async function uploadMedia({ fileOrUri, kind, userId }: { fileOrUri: any; kind: 'image' | 'video'; userId: string }): Promise<{ publicUrl: string; path: string; kind: 'image' | 'video' }> {
  return uploadMediaWithProgress(kind, fileOrUri, undefined, userId)
}