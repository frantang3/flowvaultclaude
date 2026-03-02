// hooks/useSubscription.ts
import { useMemo } from 'react'
import { useAuthActions } from './useAuth'

export interface SubscriptionFeatures {
TIER_FREE: boolean
TIER_MID: boolean
TIER_PRO: boolean
MEDIA_UPLOAD_ENABLED: boolean
ADVANCED_SEARCH_ENABLED: boolean
EXPORT_ENABLED: boolean
}

export interface SubscriptionLimits {
maxMoves: number
tierName: string
}

function readFlag(meta: any, key: keyof SubscriptionFeatures) {
  return meta && meta[key] === true
}

export function useSubscription() {
const { user } = useAuthActions()

const features: SubscriptionFeatures = useMemo(() => {
  // P0 hardening: app_metadata is server-controlled; user_metadata is user-controlled.
  // We prefer app_metadata when present, and fall back to user_metadata for legacy setups.
  const appMeta = (user as any)?.app_metadata || {}
  const userMeta = (user as any)?.user_metadata || {}

  const meta = {
    ...userMeta,
    ...appMeta,
  }

return {
TIER_FREE: readFlag(meta, 'TIER_FREE'),
TIER_MID: readFlag(meta, 'TIER_MID'),
TIER_PRO: readFlag(meta, 'TIER_PRO'),
MEDIA_UPLOAD_ENABLED: meta.MEDIA_UPLOAD_ENABLED === false ? false : true,
ADVANCED_SEARCH_ENABLED: readFlag(meta, 'ADVANCED_SEARCH_ENABLED'),
EXPORT_ENABLED: readFlag(meta, 'EXPORT_ENABLED'),
}
}, [user])

const limits: SubscriptionLimits = useMemo(() => {
if (features.TIER_PRO) {
return { maxMoves: 10000, tierName: 'Pro' }
}
if (features.TIER_MID) {
return { maxMoves: 100, tierName: 'Mid' }
}
return { maxMoves: 20, tierName: 'Free' }
}, [features.TIER_MID, features.TIER_PRO])

return { features, limits }
}