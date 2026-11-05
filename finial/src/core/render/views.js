// Named camera views of a piece, the way designers show one: a 3D view,
// one from above looking into the mouth, and flat (orthographic) front,
// top and bottom views, the elevation and plans of a drawing. Plain
// numbers in, plain numbers out; previewScene.js puts a camera there.

export const VIEWS = {
  '3d': { label: '3D', flat: false },
  above: { label: 'Above', flat: false },
  front: { label: 'Front', flat: true },
  top: { label: 'Top', flat: true },
  bottom: { label: 'Bottom', flat: true },
}

// Room left around the piece, as a fraction of it.
const MARGIN = 1.2

// Where the camera goes for a view of a box ({ center, size } as [x, y, z],
// y up) seen through a frame of the given aspect (width / height).
//   flat         an orthographic camera
//   position     camera position
//   target       what it looks at
//   halfHeight   for a flat view, half the frame's height in scene units
export function viewPose(view, { center, size }, aspect, fovDeg = 30) {
  const [cx, cy, cz] = center
  const [sx, sy, sz] = size
  const fov = (fovDeg * Math.PI) / 180
  const across = Math.max(aspect, 0.5)
  // A perspective camera far enough back to see the whole height and width.
  const reach = (Math.max(sy, sx / across) * 0.9) / Math.tan(fov / 2)
  // Flat cameras sit well clear; distance doesn't change what they see.
  const clear = Math.max(sx, sy, sz) * 4
  // Looking straight up or down, nudge a hair off the axis so "up" on the
  // screen stays defined.
  const nudge = clear * 1e-4
  switch (view) {
    case 'above': {
      const tilt = (40 * Math.PI) / 180
      return { flat: false, position: [cx, cy + reach * Math.sin(tilt), cz + reach * Math.cos(tilt)], target: center }
    }
    case 'front':
      return { flat: true, position: [cx, cy, cz + clear], target: center, halfHeight: (Math.max(sy, sx / aspect) / 2) * MARGIN }
    case 'top':
      return { flat: true, position: [cx, cy + clear, cz + nudge], target: center, halfHeight: (Math.max(sz, sx / aspect) / 2) * MARGIN }
    case 'bottom':
      return { flat: true, position: [cx, cy - clear, cz + nudge], target: center, halfHeight: (Math.max(sz, sx / aspect) / 2) * MARGIN }
    default:
      return { flat: false, position: [cx, cy + reach * 0.35, cz + reach], target: center }
  }
}
