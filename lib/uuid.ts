// lib/uuid.ts
// Small, dependency-free UUID v4 generator for React Native / Expo.
// This avoids pulling in the `uuid` package which can fail to resolve in some
// snack/Expo environments. The implementation follows RFC4122 v4 semantics
// (random-based). For cryptographically secure randomness, replace the
// Math.random-based source with Expo's SecureRandom or crypto.getRandomValues
// if available in your runtime.

// Provide a lightweight declaration for `crypto` if present in the runtime so
// TypeScript doesn't complain when we feature-detect crypto.getRandomValues.
declare const crypto: { getRandomValues?: (arr: Uint8Array) => void } | undefined

export function uuidv4(): string {
  // Try to use a secure RNG if available
  let getRandomValues: ((arr: Uint8Array) => void) | null = null
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    getRandomValues = (arr: Uint8Array) => crypto.getRandomValues(arr)
  }

  const bytes = new Uint8Array(16)
  if (getRandomValues) {
    getRandomValues(bytes)
  } else {
    // Fallback to Math.random when secure RNG isn't available. This is
    // acceptable for client-side non-security-critical IDs (app entities).
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  // Per RFC4122 set version and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant is 10

  const byteToHex: string[] = []
  for (let i = 0; i < 256; ++i) {
    byteToHex.push((i + 0x100).toString(16).substr(1))
  }

  return (
    byteToHex[bytes[0]] +
    byteToHex[bytes[1]] +
    byteToHex[bytes[2]] +
    byteToHex[bytes[3]] +
    '-' +
    byteToHex[bytes[4]] +
    byteToHex[bytes[5]] +
    '-' +
    byteToHex[bytes[6]] +
    byteToHex[bytes[7]] +
    '-' +
    byteToHex[bytes[8]] +
    byteToHex[bytes[9]] +
    '-' +
    byteToHex[bytes[10]] +
    byteToHex[bytes[11]] +
    byteToHex[bytes[12]] +
    byteToHex[bytes[13]] +
    byteToHex[bytes[14]] +
    byteToHex[bytes[15]]
  )
}