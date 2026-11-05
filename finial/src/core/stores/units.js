// The viewer's units choice, remembered in this browser. Plain read, write
// and subscribe with no React; the hook is in core/ui/useUnits.js. The
// storage key is passed in, so each app built on core keeps its own.

const EVENT = 'vessel-core-units'

export function createUnitsStore(key) {
  const read = () => {
    try {
      return window.localStorage.getItem(key) === 'in' ? 'in' : 'mm'
    } catch {
      return 'mm'
    }
  }

  const set = (units) => {
    try {
      window.localStorage.setItem(key, units)
    } catch {
      // It just won't be remembered next time.
    }
    window.dispatchEvent(new Event(EVENT))
  }

  const subscribe = (onChange) => {
    window.addEventListener(EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }

  return { read, set, subscribe }
}
