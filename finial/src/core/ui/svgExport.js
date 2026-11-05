// An SVG on the page to a PNG, through a canvas. The SVG's fonts must be
// ones the system has (an image can't load web fonts).
export async function svgToPng(svg, { widthPx, background = '#ffffff' }) {
  const box = svg.viewBox.baseVal
  const heightPx = Math.round((widthPx * box.height) / box.width)
  const copy = svg.cloneNode(true)
  copy.setAttribute('width', widthPx)
  copy.setAttribute('height', heightPx)
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  // Page styling (sizes, shadows) doesn't belong in the image.
  copy.removeAttribute('class')
  copy.removeAttribute('style')
  const text = new XMLSerializer().serializeToString(copy)
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = widthPx
    canvas.height = heightPx
    const g = canvas.getContext('2d')
    g.fillStyle = background
    g.fillRect(0, 0, widthPx, heightPx)
    g.drawImage(image, 0, 0, widthPx, heightPx)
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
