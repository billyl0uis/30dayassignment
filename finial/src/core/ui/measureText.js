// Text width in mm, measured by the browser in the font a sheet is drawn
// in, for wrapping (core/model/layout.js wrapText).
let ctx = null

export function textMeasurer(fontFamily, sizeMm, weight = 400) {
  ctx ??= document.createElement('canvas').getContext('2d')
  // Measure at 100 px and scale: steadier than tiny sizes.
  const font = `${weight} 100px ${fontFamily}`
  return (text) => {
    ctx.font = font
    return (ctx.measureText(text).width / 100) * sizeMm
  }
}
