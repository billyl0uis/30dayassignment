// Saving text to a file and reading one back, in the browser.

export function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  // After the click has had its turn with the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// "Tall canister (blue)" → "tall-canister-blue"
export const fileSlug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'design'
