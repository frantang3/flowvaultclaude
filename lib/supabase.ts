// lib/supabase.ts
// Note: We avoid importing 'react-native-url-polyfill/auto' directly to prevent bundler errors
// when the dependency is not installed. Modern Expo/Hermes environments provide URL and
// URLSearchParams natively. If you target older RN versions, consider adding the package and
// importing it in the app entrypoint.
// Lazily initialize Supabase client. If configuration is missing, return a safe stub
// so the app doesn't crash at module evaluation time. Consumers can call
// getSupabaseClient() to obtain a real client or to trigger a clear runtime error.
import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const getEnv = () => {
  // Prefer expo.extra config first, then fallback to globalThis for development
  const expoExtra = (Constants.expoConfig && (Constants.expoConfig as any).extra) || (Constants.manifest && (Constants.manifest as any).extra)
  return {
    SUPABASE_URL: (expoExtra && expoExtra.SUPABASE_URL) || (globalThis as any).SUPABASE_URL,
    SUPABASE_ANON_KEY: (expoExtra && expoExtra.SUPABASE_ANON_KEY) || (globalThis as any).SUPABASE_ANON_KEY,
  }
}

let _client: ReturnType<typeof createClient> | null = null
let _isStub = false

function makeStubClient(message: string): any {
  console.warn('[supabase] Using stub client —', message)
  const err = new Error(message)
  // Minimal stub that surfaces errors when used.
  const stub: any = {
    from: (_: string) => ({
      insert: async () => ({ data: null, error: err }),
      update: async () => ({ data: null, error: err }),
      select: async () => ({ data: null, error: err }),
      delete: async () => ({ data: null, error: err }),
      upsert: async () => ({ data: null, error: err }),
    }),
    storage: {
      from: (_bucket: string) => ({
        upload: async () => ({ data: null, error: err }),
        getPublicUrl: (_path: string) => ({ data: null, error: err }),
        remove: async () => ({ data: null, error: err }),
      }),
    },
    auth: {
      getUser: async () => ({ data: { user: null } }),
      getSession: async () => ({ data: { session: null } }),
      user: () => null,
      signIn: async () => ({ error: err }),
      signOut: async () => ({ error: err }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      setSession: async () => ({ data: { user: null }, error: err }),
    },
  }
  return stub
}

function createSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv()

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    _isStub = true
    return makeStubClient([
      'Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY.',
      'For Expo, place them in app.config.js or app.json under expo.extra.',
    ].join(' '))
  }

  const isWeb = Platform.OS === 'web'

  const storage = isWeb
    ? (AsyncStorage as any)
    : ({
        getItem: async (key: string) => {
          try {
            return await SecureStore.getItemAsync(key)
          } catch {
            return null
          }
        },
        setItem: async (key: string, value: string) => {
          await SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          })
        },
        removeItem: async (key: string) => {
          try {
            await SecureStore.deleteItemAsync(key)
          } catch {}
        },
      } as any)

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: isWeb,
      storage,
    },
  })

  _isStub = false
  return _client
}

// Lazy proxy: importing this module won't crash the app. The real client is created on first access.
const lazyProxy = new Proxy(
  {},
  {
    get(_target, prop: string | symbol) {
      if (!_client) createSupabaseClient()
      // @ts-ignore
      return (_client as any)[prop]
    },
    set(_target, prop: string | symbol, value) {
      if (!_client) createSupabaseClient()
      // @ts-ignore
      ;(_client as any)[prop] = value
      return true
    },
    has(_target, prop: string | symbol) {
      if (!_client) createSupabaseClient()
      // @ts-ignore
      return prop in _client
    },
  }
) as unknown as ReturnType<typeof createClient>

export default lazyProxy as any

export function getSupabaseClient() {
  if (!_client) createSupabaseClient()
  if (_isStub) {
    throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your environment or app config.')
  }
  return _client!
}

export function isSupabaseStub(): boolean {
  return _isStub
}

// React hook to check if Supabase is configured (for UI guards)
export function useSupabaseSetup() {
  const env = getEnv()
  return {
    isConfigured: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    url: env.SUPABASE_URL || null,
    hasAnonKey: !!env.SUPABASE_ANON_KEY,
  }
}