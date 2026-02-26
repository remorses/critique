// Global Zustand store for persistent application state.
// Manages theme selection with automatic persistence to ~/.critique/state.json.
// Shared between main diff view and review view components.

import { create } from "zustand"
import fs from "fs"
import { join } from "path"
import { homedir } from "os"
import { defaultThemeName } from "./themes.js"

// State persistence
const STATE_DIR = join(homedir(), ".critique")
const STATE_FILE = join(STATE_DIR, "state.json")

export interface PersistedState {
  themeName?: string
}

export function loadPersistedState(): PersistedState {
  try {
    const data = fs.readFileSync(STATE_FILE, "utf-8")
    return JSON.parse(data)
  } catch {
    return {}
  }
}

export function savePersistedState(state: PersistedState): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true })
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state))
  } catch {
    // Ignore write errors
  }
}

// Load initial state
const persistedState = loadPersistedState()

export interface AppState {
  // Shared
  themeName: string
}

export const useAppStore = create<AppState>(() => ({
  themeName: persistedState.themeName ?? defaultThemeName,
}))

// Subscribe to persist theme changes
useAppStore.subscribe((state) => {
  savePersistedState({ themeName: state.themeName })
})

// Re-export persisted state for initial reads
export { persistedState }
