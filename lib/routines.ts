// lib/routines.ts
import supabase from './supabase'
import { queryClient } from './queryClient'
import { setLastRoutineSaveError } from './diagnostics'

export type RoutineRow = {
  id: string
  user_id: string
  name: string
  description: string | null
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | null
  tags: string[] | null
  moves_order: string[]
  created_at: string
}

export async function listRoutines(): Promise<RoutineRow[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as RoutineRow[]
}

// Lightweight existence check to warm schema cache
async function warmSchemaCache(): Promise<boolean> {
  try {
    // Touch routines and moves heads (non-blocking); use HEAD to be lightweight
    await Promise.all([
      supabase.from('routines').select('id', { head: true, count: 'exact' }),
      supabase.from('moves').select('id', { head: true, count: 'exact' }),
    ])
    return true
  } catch (e) {
    console.log('[routine.warmCache] failed (non-blocking):', e)
    return false
  }
}

async function warmSchemaCacheWithRetries(): Promise<void> {
  const delays = [200, 600, 1200]
  for (let i = 0; i <= delays.length; i++) {
    try {
      await warmSchemaCache()
      return
    } catch (e: any) {
      if (i < delays.length && isTransientSyncError(e)) {
        const wait = delays[i]
        await new Promise(res => setTimeout(res, wait))
        continue
      }
      return
    }
  }
}

// Check if error is a transient schema-sync error
function isTransientSyncError(error: any): boolean {
  const msg = String(error?.message || error?.msg || '').toLowerCase()
  const hint = String(error?.hint || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()

  const fullText = `${msg}|${hint}|${details}`.toLowerCase()

  // Only treat these explicit phrases as transient syncing/cache issues.
  // Avoid broad patterns like 'relation' or 'does not exist' which can be permanent
  // and confuse users. Keep this narrowly focused on true sync/cache symptoms.
  const transientPatterns = [
    'server is syncing',
    'cache is not ready',
    'schema cache',
    'schema synchronization',
    'server initializing',
    'schema sync in progress',
  ]

  return transientPatterns.some(pattern => fullText.includes(pattern))
}

// Resilient insert with exponential backoff retry
async function insertWithRetry<T>(
  tableName: string,
  payload: any,
  onRetry?: (attempt: number, maxAttempts: number) => void
): Promise<T> {
  const delays = [300, 800, 1500, 3000, 5000, 8000, 12000]
  let lastError: any = null

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      console.log(`[insertWithRetry] attempt ${attempt}: calling supabase.from('${tableName}').insert()`)
      const { data, error } = await supabase
        .from(tableName)
        .insert(payload)
        .select('*')
        .single()
      
      if (error) {
        console.error(`[insertWithRetry] attempt ${attempt} returned error object:`, JSON.stringify(error, null, 2))
        
        // Retry strategy: first 3 attempts retry ANY Supabase error, later attempts only transient
        const shouldRetry = (attempt < 3) || isTransientSyncError(error)
        
        if (shouldRetry && attempt < delays.length) {
          lastError = error
          const base = delays[attempt]
          const jitter = Math.floor(Math.random() * 150)
          const delay = base + jitter
          console.log(`[insertWithRetry] attempt ${attempt + 1}/${delays.length + 1} failed (shouldRetry=${shouldRetry}), retrying in ${delay}ms...`)
          if (onRetry) onRetry(attempt + 1, delays.length + 1)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        
        console.log(`[insertWithRetry] throwing error (attempt=${attempt}, shouldRetry=${shouldRetry})`)
        throw error
      }
      
      console.log(`[insertWithRetry] success on attempt ${attempt}`)
      return data as T
    } catch (e: any) {
      console.error(`[insertWithRetry] attempt ${attempt} caught exception:`, e?.message || String(e))
      
      // Retry strategy: first 3 attempts retry ANY error, later attempts only transient
      const shouldRetry = (attempt < 3) || isTransientSyncError(e)
      
      if (shouldRetry && attempt < delays.length) {
        lastError = e
        const base = delays[attempt]
        const jitter = Math.floor(Math.random() * 150)
        const delay = base + jitter
        console.log(`[insertWithRetry] attempt ${attempt + 1}/${delays.length + 1} threw (shouldRetry=${shouldRetry}), retrying in ${delay}ms...`)
        if (onRetry) onRetry(attempt + 1, delays.length + 1)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      console.log(`[insertWithRetry] throwing exception (attempt=${attempt}, shouldRetry=${shouldRetry})`)
      throw e
    }
  }
  
  console.log(`[insertWithRetry] all retries exhausted`)
  throw lastError || new Error('Insert failed after retries')
}

// Resilient update with exponential backoff retry
async function updateWithRetry<T>(
  tableName: string,
  patch: any,
  match: { column: string, value: any },
  onRetry?: (attempt: number, maxAttempts: number) => void
): Promise<T> {
  const delays = [300, 800, 1500, 3000, 5000]
  let lastError: any = null

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .update(patch)
        .eq(match.column, match.value)
        .select('*')
        .single()
      if (error) {
        if (isTransientSyncError(error) && attempt < delays.length) {
          lastError = error
          const base = delays[attempt]
          const jitter = Math.floor(Math.random() * 150)
          const delay = base + jitter
          console.log(`[routine.updateWithRetry] attempt ${attempt + 1}/${delays.length + 1} failed, retrying in ${delay}ms...`)
          if (onRetry) onRetry(attempt + 1, delays.length + 1)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw error
      }
      return data as T
    } catch (e: any) {
      if (isTransientSyncError(e) && attempt < delays.length) {
        lastError = e
        const base = delays[attempt]
        const jitter = Math.floor(Math.random() * 150)
        const delay = base + jitter
        console.log(`[routine.updateWithRetry] attempt ${attempt + 1}/${delays.length + 1} threw, retrying in ${delay}ms...`)
        if (onRetry) onRetry(attempt + 1, delays.length + 1)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw e
    }
  }
  throw lastError || new Error('Update failed after retries')
}

export async function saveRoutine(
  payload: {
    name: string
    description?: string | null
    difficulty?: RoutineRow['difficulty']
    tags?: string[] | null
    moves_order: string[]
  },
  onRetrying?: (attempt: number, maxAttempts: number) => void
): Promise<RoutineRow> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) throw new Error('Please sign in.')

  if (!payload.name || !payload.name.trim()) {
    throw new Error('Name is required.')
  }
  if (!payload.moves_order || payload.moves_order.length === 0) {
    throw new Error('Add at least one move.')
  }

  const cleanBase = {
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    difficulty: payload.difficulty || null,
    tags: payload.tags && payload.tags.length > 0 ? payload.tags : [],
    moves_order: payload.moves_order,
  }

  try {
    // Warm schema cache (non-blocking with small retries)
    await warmSchemaCacheWithRetries()
    
    console.log(`[routine.save] uid=${uid} name="${cleanBase.name}" count=${cleanBase.moves_order.length}`)

    // Attempt 1: include user_id explicitly to satisfy RLS WITH CHECK
    const withUser = { ...cleanBase, user_id: uid }
    let row: RoutineRow | null = null
    try {
      row = await insertWithRetry<RoutineRow>('routines', withUser, onRetrying)
    } catch (firstErr: any) {
      // If RLS or validation complains, attempt again without user_id to use DB default
      const msg = String(firstErr?.message || '').toLowerCase()
      const isRls = msg.includes('row-level security') || msg.includes('rls') || msg.includes('policy')
      if (isRls) {
        console.log('[routine.save] retrying without user_id to allow DEFAULT auth.uid()')
        row = await insertWithRetry<RoutineRow>('routines', cleanBase, onRetrying)
      } else {
        throw firstErr
      }
    }
    
    console.log(`[routine.save] id=${row!.id}`)
    // Invalidate routines list so new item appears immediately
    queryClient.invalidateQueries({ queryKey: ['routines', uid] })
    setLastRoutineSaveError(null)
    return row as RoutineRow
  } catch (e: any) {
    // Log full error for debugging
    console.warn(`[routine.save] ${e?.code || 'ERR'} ${e?.message}`, e)

    const msgLower = String(e?.message || '').toLowerCase()
    let friendly: string

    // Provide explicit guidance when the routines table is missing (common setup issue)
    if ((msgLower.includes('does not exist') || msgLower.includes('relation') || msgLower.includes('table')) && msgLower.includes('routines')) {
      friendly = 'Routines table not found in database — run the migration (supabase_schema.sql)'
    } else if (isTransientSyncError(e)) {
      friendly = 'Server is syncing — please try again in a moment.'
    } else {
      friendly = e?.message || 'Unknown error while saving routine'
    }

    // Persist verbose diagnostics (code/message/details/hint) for Settings screen
    const rawDetails = [e?.code, e?.message, e?.details, e?.hint].filter(Boolean).join(' | ')
    setLastRoutineSaveError(`${friendly}${rawDetails ? ' — ' + rawDetails : ''}`)

    throw new Error(friendly)
  }
}

export async function updateRoutineRow(id: string, patch: Partial<Pick<RoutineRow, 'name' | 'description' | 'difficulty' | 'tags' | 'moves_order'>>, onRetrying?: (attempt: number, maxAttempts: number) => void): Promise<RoutineRow> {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) throw new Error('Please sign in.')
  try {
    console.log(`[routine.update] uid=${uid} id=${id}`)
    await warmSchemaCacheWithRetries()
    const row = await updateWithRetry<RoutineRow>('routines', {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.moves_order !== undefined ? { moves_order: patch.moves_order } : {}),
    }, { column: 'id', value: id }, onRetrying)
    // Invalidate cache after update
    queryClient.invalidateQueries({ queryKey: ['routines', uid] })
    return row
  } catch (e: any) {
    console.warn('[routine.update] error', e)
    const msgLower = String(e?.message || '').toLowerCase()
    let friendly: string

    if ((msgLower.includes('does not exist') || msgLower.includes('relation') || msgLower.includes('table')) && msgLower.includes('routines')) {
      friendly = 'Routines table not found in database — run the migration (supabase_schema.sql)'
    } else if (isTransientSyncError(e)) {
      friendly = 'Server is syncing — please try again in a moment.'
    } else {
      friendly = e?.message || 'Unknown error while updating routine'
    }

    throw new Error(friendly)
  }
}

export async function deleteRoutineRow(id: string) {
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) throw new Error('Please sign in.')
  const { error } = await supabase.from('routines').delete().eq('id', id)
  if (error) throw error
}