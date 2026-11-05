import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { polygonArea, type Vec2 } from './profile';
import { innerProfile, type Cap, type Section, type V3 } from './section';
import { meshSignedVolume } from './measure';
import { csg } from '../engine/csg';

const CREASE = Math.PI / 6; // edges sharper than 30° stay crisp, curves stay smooth

export function buildSection(section: Section, segments = 96): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  switch (section.kind) {
    case 'lathe': {
      const parts = [lathe(section.profile, segments)];
      const inner = innerProfile(section);
      if (inner) parts.push(lathe([...inner].reverse(), segments)); // reversed = faces point into the cavity
      geo = parts.length > 1 ? mergeGeometries(parts)! : parts[0];
      break;
    }
    case 'lathe-loop':
      geo = lathe(section.loop, segments);
      break;
    case 'box': {
      const { width: w, depth: d, height: h, wall: t } = section;
      const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(w, h, d)];
      if (t > 0) parts.push(flip(new THREE.BoxGeometry(w - 2 * t, h - 2 * t, d - 2 * t)));
      geo = (parts.length > 1 ? mergeGeometries(parts)! : parts[0]).translate(0, h / 2, 0);
      break;
    }
    case 'sweep':
      geo = outward(sweep(section.path, section.radii, section.closed, section.caps));
      break;
    case 'extrude':
      geo = outward(extrude(section.outline, section.depth));
      break;
    case 'implicit':
      geo = implicit(section);
      break;
    case 'mesh':
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(section.positions.slice(), 3));
      break;
  }
  const out = toCreasedNormals(geo, CREASE);
  geo.dispose();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function lathe(profile: Vec2[], segments: number): THREE.BufferGeometry {
  // three's LatheGeometry winds faces outward for points that climb up the outside.
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function flip(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = geo.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  return geo;
}

/** Whatever the construction's winding, make the faces point out (positive volume). */
function outward(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = geo.getIndex()!;
  return meshSignedVolume(geo.getAttribute('position').array, index.array) < 0 ? flip(geo) : geo;
}

const RING = 32; // sides around a swept rod
const CAP_RINGS = 8; // rings in a rounded end

/**
 * A tube along a path. Each ring is set square to the path using rotation-minimising
 * frames (carry the previous ring's "up" forward, removing any twist), so coils and
 * handles don't corkscrew. A closed path spreads the leftover twist evenly round.
 */
function sweep(path: V3[], radii: number[], closed: boolean, caps: [Cap, Cap]): THREE.BufferGeometry {
  const n = path.length;
  const P = path.map((p) => new THREE.Vector3(...p));
  const T = P.map((_, i) => {
    const a = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)];
    const b = closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  const N: THREE.Vector3[] = [];
  const seed = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N[0] = seed.sub(T[0].clone().multiplyScalar(seed.dot(T[0]))).normalize();
  for (let i = 1; i < n; i++) N[i] = N[i - 1].clone().sub(T[i].clone().multiplyScalar(N[i - 1].dot(T[i]))).normalize();
  if (closed) {
    const back = N[n - 1].clone().sub(T[0].clone().multiplyScalar(N[n - 1].dot(T[0]))).normalize();
    let twist = Math.acos(THREE.MathUtils.clamp(back.dot(N[0]), -1, 1));
    if (back.clone().cross(N[0]).dot(T[0]) < 0) twist = -twist;
    for (let i = 1; i < n; i++) N[i].applyAxisAngle(T[i], (twist * i) / n);
  }
  const B = T.map((t, i) => t.clone().cross(N[i]));

  const pos: number[] = [];
  const idx: number[] = [];
  const ringAt = (c: THREE.Vector3, i: number, r: number) => {
    const start = pos.length / 3;
    for (let k = 0; k < RING; k++) {
      const a = (2 * Math.PI * k) / RING;
      const v = c.clone().addScaledVector(N[i], r * Math.cos(a)).addScaledVector(B[i], r * Math.sin(a));
      pos.push(v.x, v.y, v.z);
    }
    return start;
  };
  const join = (a: number, b: number) => {
    for (let k = 0; k < RING; k++) {
      const k1 = (k + 1) % RING;
      idx.push(a + k, b + k, b + k1, a + k, b + k1, a + k1);
    }
  };
  const fan = (ring: number, c: THREE.Vector3, reverse: boolean) => {
    const center = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let k = 0; k < RING; k++) {
      const k1 = (k + 1) % RING;
      if (reverse) idx.push(center, ring + k1, ring + k);
      else idx.push(center, ring + k, ring + k1);
    }
  };

  const rings = P.map((c, i) => ringAt(c, i, radii[i]));
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) join(rings[i], rings[(i + 1) % n]);
  if (!closed) {
    for (const [end, dir] of [
      [0, -1],
      [n - 1, 1],
    ] as const) {
      const r = radii[end];
      const out = T[end].clone().multiplyScalar(dir);
      let ring = rings[end];
      if (caps[end === 0 ? 0 : 1] === 'round' && r > 1e-6) {
        for (let k = 1; k < CAP_RINGS; k++) {
          const th = (k / CAP_RINGS) * (Math.PI / 2);
          const next = ringAt(P[end].clone().addScaledVector(out, r * Math.sin(th)), end, r * Math.cos(th));
          if (dir < 0) join(next, ring);
          else join(ring, next);
          ring = next;
        }
        fan(ring, P[end].clone().addScaledVector(out, r), dir > 0);
      } else {
        fan(ring, P[end], dir > 0); // the tube winds inward until outward() flips it all; caps match
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

/** A flat outline pushed along Z: two caps and a band of side walls. */
function extrude(outline: Vec2[], depth: number): THREE.BufferGeometry {
  const pts = polygonArea(outline) < 0 ? [...outline].reverse() : outline; // counter-clockwise
  const n = pts.length;
  const h = depth / 2;
  const pos: number[] = [];
  for (const [x, y] of pts) pos.push(x, y, h);
  for (const [x, y] of pts) pos.push(x, y, -h);
  const idx: number[] = [];
  const tris = THREE.ShapeUtils.triangulateShape(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    [],
  );
  for (let [a, b, c] of tris) {
    const area = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
    if (area < 0) [b, c] = [c, b];
    idx.push(a, b, c, n + a, n + c, n + b);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, n + i, n + j, i, n + j, j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

/** Meshes a distance function with manifold's level-set mesher. */
function implicit(section: Extract<Section, { kind: 'implicit' }>): THREE.BufferGeometry {
  const size = Math.max(section.max[0] - section.min[0], section.max[1] - section.min[1], section.max[2] - section.min[2]);
  const edge = size / (section.cells ?? 72);
  const pad = 2 * edge + section.bulge;
  const m = csg().Manifold.levelSet(
    (p) => -section.sdf(p[0], p[1], p[2]),
    { min: section.min.map((v) => v - pad) as V3, max: section.max.map((v) => v + pad) as V3 },
    edge,
    0,
  );
  try {
    const mesh = m.getMesh();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.vertProperties), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
    return geo;
  } finally {
    m.delete();
  }
}
