// lib/diagnostics.ts
// Lightweight diagnostics tracking across the app (in-memory state)
// Expose setters/getters so screens can read and display simple text readouts.

let routinesReachable: boolean | null = null
let lastRoutineSaveError: string | null = null
let lastMediaOverlayState: { playing: boolean; overlayVisible: boolean } | null = null

export function setRoutinesReachable(ok: boolean) {
  routinesReachable = ok
}
export function getRoutinesReachable(): boolean | null {
  return routinesReachable
}

export function setLastRoutineSaveError(msg: string | null) {
  lastRoutineSaveError = msg
}
export function getLastRoutineSaveError(): string | null {
  return lastRoutineSaveError
}

export function setLastMediaOverlayState(state: { playing: boolean; overlayVisible: boolean }) {
  lastMediaOverlayState = state
}
export function getLastMediaOverlayState(): { playing: boolean; overlayVisible: boolean } | null {
  return lastMediaOverlayState
}