// hooks/useAuth.ts
import { useState, useEffect, useMemo, useRef } from 'react'
import * as Linking from 'expo-linking'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import supabase from '../lib/supabase'
import { createDeepLink, parseLink } from '../lib/linking'
import { queryClient } from '../lib/queryClient'

const IS_DEV = (globalThis as any).__DEV__ === true

type AuthEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | string

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthEvent | null>(null)
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false)
  const lastUidRef = useRef<string | null>(null)

  // Lazily compute a platform-appropriate redirect target only when needed.
  const getRedirectTo = useMemo(() => {
    return () => {
      try {
        if (Platform.OS === 'web' && typeof (globalThis as any).window !== 'undefined') {
          return (globalThis as any).window.location.origin
        }
        return createDeepLink('/auth-callback')
      } catch (err) {
        console.warn('Failed to compute redirectTo, using safe fallback:', err)
        // Fallback to a neutral URL that won't crash; Supabase will still send OTP via email.
        return 'https://auth-callback.invalid/auth-callback'
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const parseParams = (raw: string): Record<string, string> => {
      const out: Record<string, string> = {}
      const s = raw.replace(/^\?/, '').replace(/^#/, '')
      if (!s) return out
      for (const part of s.split('&')) {
        if (!part) continue
        const idx = part.indexOf('=')
        const k = idx >= 0 ? part.slice(0, idx) : part
        const v = idx >= 0 ? part.slice(idx + 1) : ''
        try {
          out[decodeURIComponent(k)] = decodeURIComponent(v)
        } catch {
          out[k] = v
        }
      }
      return out
    }

    const parseTokensFromUrl = (url: string) => {
      // Supabase may return tokens in query OR fragment depending on platform/config.
      // e.g. myapp://auth-callback#access_token=...&refresh_token=...&type=recovery
      try {
        const parsed = parseLink(url)
        const queryParams = (parsed.queryParams || {}) as Record<string, any>

        const fragment = url.includes('#') ? url.split('#')[1] : ''
        const fragmentParams = parseParams(fragment)

        const merged = { ...queryParams, ...fragmentParams }
        const access_token = (merged['access_token'] as string | undefined) || undefined
        const refresh_token = (merged['refresh_token'] as string | undefined) || undefined
        const type = (merged['type'] as string | undefined) || undefined

        return { access_token, refresh_token, type }
      } catch (err) {
        console.warn('Failed to parse auth tokens from URL:', err)
        return { access_token: undefined, refresh_token: undefined, type: undefined }
      }
    }

    // Get current session on mount — crucial for avoiding 'not authenticated' on first render
    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const nextUser = data?.session?.user || null
        if (isMounted) setUser(nextUser)
        if (IS_DEV) console.log('[auth] hydrated session user=', nextUser?.id || 'null')
      } catch (e) {
        console.warn('Failed to get session', e)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    initAuth()

    // Listen for auth state changes
    const { data: subscription } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      setLastAuthEvent(event)
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryActive(true)
      }

      const newUser = session?.user || null
      const prevUid = lastUidRef.current
      const newUid = newUser?.id || null

      lastUidRef.current = newUid
      setUser(newUser)

      // If user changed, clear cache for old user and refetch for new user
      if (prevUid !== newUid) {
        if (prevUid) {
          console.log('[auth] clearing cache for old user:', prevUid)
          queryClient.removeQueries({ queryKey: ['moves', prevUid] })
          queryClient.removeQueries({ queryKey: ['routines', prevUid] })
        }
        if (newUid) {
          console.log('[auth] invalidating for new user:', newUid)
          queryClient.invalidateQueries({ queryKey: ['moves', newUid] })
          queryClient.invalidateQueries({ queryKey: ['routines', newUid] })
        }
      }
    })

    // Handle deep links that may contain access_token/refresh_token
    const handleUrl = async (url: string | null) => {
      if (!url) return
      const { access_token, refresh_token, type } = parseTokensFromUrl(url)

      if (type === 'recovery') {
        setPasswordRecoveryActive(true)
      }

      if (!access_token) return

      try {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token: refresh_token || '' })
        if (error) console.warn('Failed to set session from deep link:', error.message)
        if (data?.user) setUser(data.user)
      } catch (err) {
        console.warn('Failed to set session from deep link:', err)
      }
    }

    // Handle initial URL and subsequent URL events
    Linking.getInitialURL().then(handleUrl)
    const sub = Linking.addEventListener('url', ({ url }: any) => handleUrl(url))

    // Additionally handle web hash fragments produced by Supabase (e.g., #access_token=...)
    if (Platform.OS === 'web' && typeof (globalThis as any).window !== 'undefined') {
      const w: any = (globalThis as any).window
      const hash = w.location?.hash
      if (hash && hash.startsWith('#')) {
        const params = parseParams(hash.substring(1))
        const access_token = params['access_token'] || undefined
        const refresh_token = params['refresh_token'] || undefined
        const type = params['type'] || undefined
        if (type === 'recovery') setPasswordRecoveryActive(true)

        if (access_token) {
          supabase.auth.setSession({ access_token, refresh_token: refresh_token || '' })
            .then(({ data, error }: any) => {
              if (error) console.warn('Failed to set session from URL hash:', error.message)
              if (data?.user) setUser(data.user)
              // Clean the URL
              try {
                w.history?.replaceState({}, w.document?.title, w.location?.pathname + w.location?.search)
              } catch {}
            })
            .catch((err: any) => console.warn('setSession error (hash):', err))
        }
      }
    }

    return () => {
      isMounted = false
      subscription?.subscription?.unsubscribe()
      sub.remove()
    }
  }, [])

  // Email + 6-digit one-time code
  const signInWithOTP = async (email: string) => {
    const redirectTo = getRedirectTo()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    })
    if (error) throw error
    return { success: true, redirectTo }
  }

  const verifyEmailOtp = async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
    if (error) throw error
    setUser(data?.user ?? null)
    return { success: true }
  }

  // Email + Password
  const signUpWithPassword = async (email: string, password: string) => {
    const redirectTo = getRedirectTo()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    })
    if (error) throw error

    // If Confirm Email is enabled, session will be null until they verify.
    const sessionUser = data?.session?.user || null
    if (sessionUser) setUser(sessionUser)

    return { success: true, needsEmailVerification: !data?.session }
  }

  const resendSignupEmail = async (email: string) => {
    const redirectTo = getRedirectTo()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    })
    if (error) throw error
    return { success: true }
  }

  const signInWithPassword = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data?.user) setUser(data.user)
    return { success: true }
  }

  const resetPasswordForEmail = async (email: string) => {
    const redirectTo = getRedirectTo()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    if (error) throw error
    return { success: true }
  }

  const updatePassword = async (newPassword: string) => {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    if (data?.user) setUser(data.user)
    setPasswordRecoveryActive(false)
    return { success: true }
  }

  const clearPasswordRecovery = () => {
    setPasswordRecoveryActive(false)
  }

  const signOut = async () => {
    const oldUid = user?.id
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    if (oldUid) {
      if (IS_DEV) console.log('[auth] clearing cache on sign out')
      queryClient.removeQueries({ queryKey: ['moves', oldUid] })
      queryClient.removeQueries({ queryKey: ['routines', oldUid] })
    }

    // Clear local app state that may be user-specific.
    // NOTE: this should NOT include auth tokens (handled by supabase.auth.signOut + SecureStore).
    try {
      await AsyncStorage.multiRemove([
        '@dance_moves_v1',
        '@dance_routines_v1',
        'hasSeenOnboarding',
      ])
    } catch {}

    lastUidRef.current = null
    setPasswordRecoveryActive(false)
    setUser(null)
  }

  return {
    user,
    uid: user?.id || null,
    loading,
    lastAuthEvent,
    passwordRecoveryActive,
    clearPasswordRecovery,
    // OTP (6-digit code) methods
    signInWithOTP,
    verifyEmailOtp,
    // Password methods
    signUpWithPassword,
    resendSignupEmail,
    signInWithPassword,
    resetPasswordForEmail,
    updatePassword,
    // Misc
    signOut,
    redirectTo: getRedirectTo(),
  }
}

// Preferred alias (lint rule): useAuthActions
export const useAuthActions = useAuth