import { useSyncExternalStore } from 'react'

// A units store (core/stores/units.js) as a React hook.
export const useUnits = (store) => useSyncExternalStore(store.subscribe, store.read, () => 'mm')
