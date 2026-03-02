// supabase/functions/sign-upload/index.ts
// Edge Function to generate signed upload URLs for RLS-compliant media uploads
// Usage: POST /functions/v1/sign-upload with { kind: 'image' | 'video', ext: string, contentType: string }
// Returns: { signedUrl: string, objectName: string, contentType: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime'])
const MAX_EXT_LEN = 10

function safeOrigin(req: Request) {
  const origin = req.headers.get('Origin') || '*'
  // If you set ALLOWED_ORIGINS="https://yourdomain.com,https://staging.yourdomain.com" in env,
  // we will lock CORS down. Otherwise we keep '*' for mobile compatibility.
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowed.length === 0) return '*'
  return allowed.includes(origin) ? origin : allowed[0]
}

serve(async (req) => {
  const corsOrigin = safeOrigin(req)

  // CORS headers for web clients
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    // 1. Validate Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Missing Authorization header.' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
      })
    }

    // 2. Create Supabase client with user's auth context
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 3. Validate user is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Invalid or expired token.' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
      })
    }

    // 4. Parse request body
    const body = await req.json().catch(() => ({}))
    const kind = body?.kind
    const extRaw = body?.ext
    const contentTypeRaw = body?.contentType

    if (!kind || !extRaw) {
      return new Response(JSON.stringify({ error: 'Missing required fields: kind, ext' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
      })
    }

    // 5. Validate kind
    if (kind !== 'image' && kind !== 'video') {
      return new Response(JSON.stringify({ error: 'Invalid kind. Must be "image" or "video".' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
      })
    }

    // 6. Validate ext / contentType
    const ext = String(extRaw).toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!ext || ext.length > MAX_EXT_LEN) {
      return new Response(JSON.stringify({ error: 'Invalid file extension.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
      })
    }

    const contentType = String(contentTypeRaw || '').toLowerCase()
    if (kind === 'image') {
      const ct = contentType || 'image/jpeg'
      if (!ALLOWED_IMAGE_MIMES.has(ct)) {
        return new Response(JSON.stringify({ error: 'Unsupported image content type.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
        })
      }
    } else {
      const ct = contentType || 'video/mp4'
      if (!ALLOWED_VIDEO_MIMES.has(ct)) {
        return new Response(JSON.stringify({ error: 'Unsupported video content type.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
        })
      }
    }

    // 7. Build RLS-compliant path: {uid}/{YYYY-MM-DD}/{timestamp}-{random}.{ext}
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const objectName = `${user.id}/${yyyy}-${mm}-${dd}/${ts}-${rand}.${ext}`

    // 8. Create signed upload URL (60 second expiry)
    const { data, error } = await supabaseClient.storage
      .from('moves')
      .createSignedUploadUrl(objectName, {
        upsert: false, // Prevent overwriting existing files
      })

    if (error) {
      return new Response(JSON.stringify({ error: 'Storage error.' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
      })
    }

    // 9. Return signed URL and metadata
    const finalContentType = (contentType && contentType.length > 0)
      ? contentType
      : (kind === 'video' ? 'video/mp4' : 'image/jpeg')

    return new Response(JSON.stringify({
      signedUrl: data.signedUrl,
      objectName,
      contentType: finalContentType,
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': corsOrigin,
      }
    })

  } catch (err) {
    // Do not leak internal error details
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
    })
  }
})