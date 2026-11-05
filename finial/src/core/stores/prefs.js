// A small object of settings remembered in this browser, such as a shop's
// own warning rules. Plain read, write and subscribe with no React; the
// hook is in core/ui/usePrefs.js. Stored values are laid over the
// defaults, so a setting added later still has a value.

export function createPrefsStore(key, defaults) {
  const event = `vessel-core-prefs:${key}`
  let raw = null
  let cached = defaults

  // The same object back until the stored text changes, as
  // useSyncExternalStore needs.
  const read = () => {
    let text = null
    try {
      text = window.localStorage.getItem(key)
    } catch {
      return cached
    }
    if (text === raw) return cached
    raw = text
    try {
      cached = { ...defaults, ...JSON.parse(text ?? '{}') }
    } catch {
      cached = defaults
    }
    return cached
  }

  const set = (patch) => {
    const next = { ...read(), ...patch }
    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Not remembered next time, but used now.
      cached = next
    }
    window.dispatchEvent(new Event(event))
  }

  const reset = () => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      cached = defaults
    }
    window.dispatchEvent(new Event(event))
  }

  const subscribe = (onChange) => {
    window.addEventListener(event, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(event, onChange)
      window.removeEventListener('storage', onChange)
    }
  }

  return { read, set, reset, subscribe, defaults }
}
