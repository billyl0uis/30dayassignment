import { readDesign, saveDesign } from './design'

// The design you're working on, kept in this browser so a reload doesn't
// lose it. Saving to a file is still how you keep one for good.
const KEY = 'finial:draft'

export function loadDraft() {
  try {
    const text = window.localStorage.getItem(KEY)
    return text ? readDesign(text) : null
  } catch {
    return null
  }
}

export function saveDraft(design) {
  try {
    window.localStorage.setItem(KEY, saveDesign(design))
  } catch {
    // Not kept this time; the design on screen is unaffected.
  }
}
