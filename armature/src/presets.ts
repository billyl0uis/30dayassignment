import { addNode, addRod, arcPoints, bendRod, generateCage, nodeById, polyline } from './model/frame';
import { newJoin, newPart } from './model/io';
import { emptySculpture, type Sculpture, type Vec3 } from './model/types';
import { blowTo } from './physics/blow';
import { add, len, norm, scale, sub } from './physics/vec';

const deg = (d: number) => (d * Math.PI) / 180;
const polar = (r: number, aDeg: number, y: number): Vec3 => [r * Math.cos(deg(aDeg)), y, r * Math.sin(deg(aDeg))];

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  build: () => Sculpture;
}

/** 1. Copper cage (8 ribs × 3 rings) on a 3-point steel ring base, glass already blown into it. */
function cageVessel(): Sculpture {
  const s = emptySculpture('Blown-into-wire-cage vessel');
  // steel ring base: ring at y = 30, three legs to the floor
  const ring: string[] = [];
  for (let k = 0; k < 24; k++) ring.push(addNode(s, polar(70, k * 15, 30)));
  ring.forEach((id, k) => addRod(s, id, ring[(k + 1) % ring.length], 'mild_steel', 6));
  for (const a of [90, 210, 330]) {
    const foot = addNode(s, polar(95, a, 0));
    addRod(s, ring[a / 15], foot, 'mild_steel', 6);
  }
  const cage = generateCage(s, { center: [0, 170, 0], ribs: 8, rings: 3, radiusMm: 90, heightMm: 200, wireMm: 3, material: 'copper', taper: 0.45, name: 'Copper cage' });
  // three struts from the base ring up to the cage's bottom ring (ribs at 0°, 135°, 225°)
  for (const j of [0, 3, 5]) addRod(s, ring[(j * 45) / 15], cage.grid[0][j], 'mild_steel', 6);

  const part = newPart('blown', [0, 170, 0], 'Blown form');
  part.geom = { kind: 'blown', outerRadiusMm: 45, wallMm: 14 };
  s.parts.push(part);
  blowTo(s, part, cage, 125);
  const j = newJoin('cage_capture', part.id);
  j.anchor = { kind: 'cage', cageId: cage.id };
  s.joins.push(j);
  return s;
}

/** 2. Steel tripod with a post and three arms; a glass pod sits on each arm in a padded clip. */
export const POD_ARM_ANGLES = [30, 150, 270];
export const POD_ARM_R = 90;
function tripodPods(): Sculpture {
  const s = emptySculpture('Steel stand with three glass pods');
  const hub = addNode(s, [0, 60, 0]);
  for (const a of [90, 210, 330]) {
    const foot = addNode(s, polar(70, a, 0));
    addRod(s, hub, foot, 'mild_steel', 8);
  }
  const heights = [180, 240, 300];
  const post = polyline(s, [[0, 60, 0], [0, 180, 0], [0, 240, 0], [0, 300, 0], [0, 340, 0]], 'mild_steel', 8, hub);
  const shapes: { shape: 'sphere' | 'ellipsoid' | 'teardrop'; r: number; sc: Vec3; name: string }[] = [
    { shape: 'sphere', r: 35, sc: [1, 1, 1], name: 'Pod A (sphere)' },
    { shape: 'ellipsoid', r: 32, sc: [1, 1.25, 1], name: 'Pod B (ellipsoid)' },
    { shape: 'teardrop', r: 33, sc: [1, 1, 1], name: 'Pod C (teardrop)' },
  ];
  POD_ARM_ANGLES.forEach((a, i) => {
    const tip = addNode(s, polar(POD_ARM_R, a, heights[i]));
    addRod(s, post.nodeIds[i + 1], tip, 'mild_steel', 8);
    const sh = shapes[i];
    const part = newPart('solid', add(polar(POD_ARM_R, a, heights[i]), [0, sh.r * sh.sc[1] + 4, 0]), sh.name);
    part.geom = { kind: 'solid', shape: sh.shape, radiusMm: sh.r };
    part.scale = sh.sc;
    s.parts.push(part);
    const j = newJoin('clip', part.id);
    j.contact = 'padded';
    j.anchor = { kind: 'node', nodeId: tip };
    s.joins.push(j);
  });
  return s;
}

/** 3. Bent copper tree, 12 glass leaves on wire wraps — leaf 12 is left unattached on purpose. */
function copperTree(): Sculpture {
  const s = emptySculpture('Copper tree with glass leaves');
  const trunk = polyline(s, [[0, 40, 0], [5, 90, 3], [-4, 140, 0], [3, 190, -3], [0, 230, 0]], 'copper', 8);
  // four bent roots to the floor
  for (const a of [20, 110, 200, 290]) {
    const foot = addNode(s, polar(95, a, 0));
    const r = addRod(s, trunk.nodeIds[0], foot, 'copper', 6);
    bendRod(s, r, 3, 12, 0);
  }
  const branches: [number, Vec3, number][] = [
    [2, [-95, 200, 25], 14],
    [3, [90, 250, -20], 14],
    [4, [-45, 320, 35], 10],
    [4, [55, 310, -45], 10],
    [1, [75, 140, 45], 12],
  ];
  const leafNodes: string[] = [];
  for (const [from, to, sag] of branches) {
    const start = nodeById(s, trunk.nodeIds[from])!.p;
    const pts = arcPoints(start, to, 4, sag, 0);
    const b = polyline(s, pts, 'copper', 4, trunk.nodeIds[from]);
    leafNodes.push(...b.nodeIds.slice(2));
  }
  const center: Vec3 = [0, 200, 0];
  leafNodes.slice(0, 12).forEach((nid, i) => {
    const p = nodeById(s, nid)!.p;
    const out = norm(sub([p[0], 0, p[2]], [center[0], 0, center[2]]));
    const dir = norm(add(scale(out, 1), [0, -0.8, 0]));
    const leaf = newPart('leaf', add(p, scale(dir, 32)), `Leaf ${i + 1}`);
    leaf.geom = { kind: 'leaf', lengthMm: 60, widthMm: 28, thicknessMm: 4 };
    const yaw = (Math.atan2(-dir[2], dir[0]) * 180) / Math.PI;
    const pitch = (Math.asin(dir[1] / len(dir)) * 180) / Math.PI;
    leaf.rotationDeg = [0, yaw, pitch];
    s.parts.push(leaf);
    if (i < 11) {
      const j = newJoin('wire_wrap', leaf.id);
      j.anchor = { kind: 'node', nodeId: nid };
      s.joins.push(j);
    }
  });
  return s;
}

/** 4. Cast slab on four steel standoffs to the wall, bolted; one hole sits too close to the edge. */
function wallSlab(): Sculpture {
  const s = emptySculpture('Wall piece on standoffs');
  s.wall = { enabled: true, z: 0 };
  const slab = newPart('cast', [0, 900, 46], 'Cast slab');
  slab.geom = { kind: 'cast', shape: 'slab', sizeMm: [300, 200, 12] };
  s.parts.push(slab);
  const holes: [number, number][] = [[-110, 840], [110, 840], [-110, 960], [130, 965]];
  for (const [x, y] of holes) {
    const w = addNode(s, [x, y, 0]);
    const tip = addNode(s, [x, y, 40]);
    addRod(s, w, tip, 'stainless_304', 12);
    const j = newJoin('bolt', slab.id);
    j.anchor = { kind: 'node', nodeId: tip };
    j.washer = 'neoprene';
    j.holeDiameterMm = 8;
    s.joins.push(j);
  }
  return s;
}

export const PRESETS: Preset[] = [
  { id: 'cage', name: 'Blown-into-wire-cage vessel', blurb: 'Copper cage on a steel ring base with glass blown into it. Shows cage capture and the hot-contact note.', build: cageVessel },
  { id: 'pods', name: 'Steel stand with three glass pods', blurb: 'Balanced and OK. Drag Pod A outward along its arm to watch the tip check go WARN, then BAD.', build: tripodPods },
  { id: 'tree', name: 'Copper tree with glass leaves', blurb: 'Twelve leaves on wire wraps. Leaf 12 has no join — find it and attach it.', build: copperTree },
  { id: 'wall', name: 'Wall piece on standoffs', blurb: 'Cast slab bolted to four standoffs. One hole is too close to the edge.', build: wallSlab },
];
