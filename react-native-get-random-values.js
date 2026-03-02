// Prefer Expo's native randomness when available.
let ExpoCrypto = null
try {
  ExpoCrypto = require('expo-crypto')
} catch {
  ExpoCrypto = null
}

;(function ensureCryptoPolyfills() {
  const g = typeof globalThis !== 'undefined' ? globalThis : global

  if (!g.crypto) g.crypto = {}

  if (typeof g.crypto.getRandomValues !== 'function') {
    if (ExpoCrypto && typeof ExpoCrypto.getRandomValues === 'function') {
      g.crypto.getRandomValues = (typedArray) => ExpoCrypto.getRandomValues(typedArray)
    } else {
      g.crypto.getRandomValues = (typedArray) => {
        if (!typedArray || typeof typedArray.length !== 'number') {
          throw new TypeError('crypto.getRandomValues: expected an integer TypedArray')
        }

        for (let i = 0; i < typedArray.length; i += 1) {
          typedArray[i] = Math.floor(Math.random() * 256)
        }

        return typedArray
      }
    }
  }

  if (typeof g.crypto.randomUUID !== 'function') {
    if (ExpoCrypto && typeof ExpoCrypto.randomUUID === 'function') {
      g.crypto.randomUUID = () => ExpoCrypto.randomUUID()
    }
  }
})()

module.exports = {}