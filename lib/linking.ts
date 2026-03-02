// lib/linking.ts
import * as Linking from 'expo-linking'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

// Get the app's custom URL scheme from Expo config. Fallback to a sensible default if missing.
export function getAppScheme(): string {
  const schemeFromConfig = (Constants.expoConfig as any)?.scheme || (Constants.manifest as any)?.scheme
  // Default fallback. Keep in sync with app.json -> expo.scheme
  return schemeFromConfig || 'flowvault'
}

// Create a deep link URL.
// In standalone builds, force the custom scheme only if it's present in the manifest.
// In development (Expo Go / a0 host app), let expo-linking produce exp:// URLs.
export function createDeepLink(path: string): string {
  const ownership = (Constants as any)?.appOwnership as 'expo' | 'guest' | 'standalone' | undefined
  const manifestScheme = (Constants.expoConfig as any)?.scheme || (Constants.manifest as any)?.scheme

  const isNative = Platform.OS === 'ios' || Platform.OS === 'android'
  const isStandalone = ownership === 'standalone'
  const hasRegisteredScheme = !!manifestScheme

  try {
    if (isNative && isStandalone) {
      // Only force the scheme if it's actually registered in the native manifest.
      if (hasRegisteredScheme) {
        return Linking.createURL(path, { scheme: manifestScheme })
      }
      // Fallback: Return a safe absolute URL that won't throw. Supabase redirects can still work on web/OTP.
      // We intentionally avoid calling Linking.createURL here because expo-linking throws without a scheme in standalone.
      const normalizedPath = path.startsWith('/') ? path : `/${path}`
      return `https://auth-callback.invalid${normalizedPath}`
    }

    // Development or web: return exp:// (or http(s) on web) without forcing custom scheme.
    return Linking.createURL(path)
  } catch (err) {
    // Last-resort fallback to avoid crashing the app.
    console.warn('createDeepLink failed, falling back to relative path:', err)
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return normalizedPath
  }
}

// Re-export parse for convenience in places handling inbound links.
export const parseLink = Linking.parse