import { useSyncExternalStore } from 'react'

// A prefs store (core/stores/prefs.js) as a React hook.
export const usePrefs = (store) => useSyncExternalStore(store.subscribe, store.read, () => store.defaults)
