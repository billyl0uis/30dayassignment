import { Box3, Camera, OrthographicCamera, PerspectiveCamera, Sphere, Vector3, type Object3D, type Scene, type WebGLRenderer } from 'three';

export type ViewId = 'front' | 'side' | 'top' | 'three-quarter';

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
  { id: 'three-quarter', label: '3/4' },
];

export type Shot = { id: ViewId; label: string; canvas: HTMLCanvasElement };

type Capturer = (px: number) => Shot[];

/** Set by <ViewCapture/> inside the 3D canvas; null until the canvas exists. */
let capturer: Capturer | null = null;
export function setCapturer(c: Capturer | null) {
  capturer = c;
}

const MARGIN = 1.18; // breathing room around the piece in each view

/**
 * Front, side and top are orthographic, like a technical drawing: no
 * perspective, so the outlines are true shapes and line up with each other.
 * The 3/4 view keeps perspective so the glass still reads as glass.
 */
function cameraFor(view: ViewId, box: Box3): Camera {
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const r = box.getBoundingSphere(new Sphere()).radius;
  const far = r * 20 + 10;

  if (view === 'three-quarter') {
    const cam = new PerspectiveCamera(32, 1, 0.05, far);
    const dir = new Vector3(1, 0.65, 1.25).normalize();
    const dist = (r * MARGIN) / Math.sin((32 / 2) * (Math.PI / 180));
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center);
    return cam;
  }

  // Half-width of the frame: the larger of the two extents this view shows.
  const across = { front: Math.max(size.x, size.y), side: Math.max(size.z, size.y), top: Math.max(size.x, size.z) }[view];
  const h = (across / 2) * MARGIN;
  const cam = new OrthographicCamera(-h, h, h, -h, 0.05, far);
  const back = r * 4 + 2;
  if (view === 'front') cam.position.set(center.x, center.y, center.z + back);
  if (view === 'side') cam.position.set(center.x + back, center.y, center.z);
  if (view === 'top') {
    cam.position.set(center.x, center.y + back, center.z);
    cam.up.set(0, 0, -1); // front of the piece at the bottom of the picture
  }
  cam.lookAt(center);
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * Renders each view straight onto the live canvas at a fixed square size,
 * copies it out, then puts the canvas back. It all happens inside one task,
 * so the browser never paints the in-between frames.
 */
export function makeCapturer(gl: WebGLRenderer, scene: Scene, subject: () => Object3D | null, restore: () => void): Capturer {
  return (px) => {
    const root = subject();
    if (!root) return [];
    const box = new Box3().setFromObject(root);
    if (box.isEmpty()) return [];

    const prevRatio = gl.getPixelRatio();
    gl.setPixelRatio(1);
    gl.setSize(px, px, false);
    // The plinth reads as a flat slab in the drawing views, so it only shows in the 3/4.
    const plinth = scene.getObjectByName('plinth');
    const plinthShown = plinth?.visible ?? false;
    const shots = VIEWS.map(({ id, label }) => {
      if (plinth) plinth.visible = plinthShown && id === 'three-quarter';
      gl.render(scene, cameraFor(id, box));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = px;
      canvas.getContext('2d')!.drawImage(gl.domElement, 0, 0);
      return { id, label, canvas };
    });
    if (plinth) plinth.visible = plinthShown;
    gl.setPixelRatio(prevRatio);
    restore();
    return shots;
  };
}

// Background tabs pause animation frames, so don't wait on one forever.
const nextFrame = () =>
  new Promise<void>((r) => {
    requestAnimationFrame(() => r());
    setTimeout(r, 120);
  });

/** Waits a couple of frames (so React has hidden the gizmo) and then shoots. */
export async function captureViews(px = 1200): Promise<Shot[]> {
  await nextFrame();
  await nextFrame();
  return capturer ? capturer(px) : [];
}

/** All four views in a 2×2 grid with small labels, like a drawing sheet. */
export function composeSheet(shots: Shot[], bg: string, ink: string): HTMLCanvasElement {
  const cell = shots[0]?.canvas.width ?? 1200;
  const pad = Math.round(cell * 0.04);
  const head = Math.round(cell * 0.09);
  const sheet = document.createElement('canvas');
  sheet.width = cell * 2 + pad * 3;
  sheet.height = cell * 2 + pad * 3 + head;
  const g = sheet.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, sheet.width, sheet.height);

  g.fillStyle = ink;
  g.textBaseline = 'middle';
  g.font = `600 ${Math.round(head * 0.38)}px system-ui, sans-serif`;
  g.fillText('Glass Mash', pad, pad + head / 2);
  g.font = `${Math.round(head * 0.28)}px system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), sheet.width - pad, pad + head / 2);

  g.textAlign = 'left';
  g.font = `600 ${Math.round(cell * 0.03)}px system-ui, sans-serif`;
  shots.forEach((s, i) => {
    const x = pad + (i % 2) * (cell + pad);
    const y = pad + head + Math.floor(i / 2) * (cell + pad);
    g.drawImage(s.canvas, x, y);
    g.globalAlpha = 0.85;
    g.fillText(s.label.toUpperCase(), x + cell * 0.03, y + cell * 0.05);
    g.globalAlpha = 1;
  });
  return sheet;
}

export function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  const a = document.createElement('a');
  a.download = name;
  a.href = canvas.toDataURL('image/png');
  a.click();
}
