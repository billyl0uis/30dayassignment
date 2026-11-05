import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { thicknessMaterial, createGlassMaterial } from './glass.js';
import { createVolumeTextures, fillVolumeTextures } from './voltex.js';

// World units are centimetres. Floor is y = 0.

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 2000);
  camera.position.set(22, 20, 34);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 7, 0);
  controls.enableDamping = true;
  controls.minDistance = 8;
  controls.maxDistance = 160;
  controls.maxPolarAngle = Math.PI * 0.495; // stay above the floor

  // Floor with a 1 cm grid so scale reads at a glance.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x000000, 0x000000);
  grid.material.transparent = true;
  grid.material.opacity = 0.08;
  grid.position.y = 0.01;
  scene.add(grid);

  scene.add(makeRuler());

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(10, 30, 15);
  scene.add(key);

  // Punty: a steel rod coming in along -x, ending at the punty mark.
  const punty = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 1, 20),
    new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.9, roughness: 0.35 })
  );
  punty.rotation.z = Math.PI / 2;
  scene.add(punty);

  const glassGeo = new THREE.BufferGeometry();
  const glassMat = createGlassMaterial();
  const glass = new THREE.Mesh(glassGeo, glassMat);
  scene.add(glass);

  // The thickness pass draws only the glass, into its own scene.
  const thickScene = new THREE.Scene();
  thickScene.add(new THREE.Mesh(glassGeo, thicknessMaterial));

  // Float target for summed depths. Blending into 32-bit float needs
  // EXT_float_blend; without it fall back to half float (≈0.03 cm error).
  const floatBlend = !!renderer.extensions.get('EXT_float_blend');
  const thickRT = new THREE.WebGLRenderTarget(1, 1, {
    type: floatBlend ? THREE.FloatType : THREE.HalfFloatType,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
  // Everything except the glass, seen through it.
  const backRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  glassMat.uniforms.tThick.value = thickRT.texture;
  glassMat.uniforms.tBack.value = backRT.texture;

  // ── Measurement markers: drawn last, on top of everything ──
  const overlay = new THREE.Scene();
  const markerMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
  const lineMat = (color, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
  const RED = 0xe0362c, GREEN = 0x18a46a;

  const thickest = new THREE.Group();
  thickest.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), markerMat(RED)));
  const inscribed = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 24, 12)), lineMat(RED, 0.35));
  thickest.add(inscribed);
  overlay.add(thickest);

  const com = new THREE.Group();
  const comDot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), markerMat(GREEN));
  const dropGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const drop = new THREE.Line(dropGeo, lineMat(GREEN));
  const foot = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 24), markerMat(GREEN));
  foot.rotation.x = -Math.PI / 2;
  const tipGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const tipLine = new THREE.Line(tipGeo, lineMat(GREEN, 0.8));
  const support = new THREE.LineLoop(new THREE.BufferGeometry(), lineMat(GREEN));
  com.add(comDot, drop, foot, tipLine, support);
  overlay.add(com);

  function setMarkers(a, show) {
    thickest.visible = show.thickest && !!a.thickest.centre;
    if (thickest.visible) {
      thickest.position.fromArray(a.thickest.centre);
      inscribed.scale.setScalar(a.thickest.diameter / 2);
    }
    com.visible = show.com && !!a.com;
    if (!com.visible) return;
    const [x, y, z] = a.com;
    comDot.position.set(x, y, z);
    dropGeo.attributes.position.array.set([x, y, z, x, 0.02, z]);
    dropGeo.attributes.position.needsUpdate = true;
    foot.position.set(x, 0.03, z);
    // Support polygon on the floor, and the shortest line to its edge
    const hull = a.support.hull;
    support.visible = hull.length >= 3;
    if (support.visible) {
      support.geometry.dispose();
      support.geometry = new THREE.BufferGeometry().setFromPoints(hull.map(([hx, hz]) => new THREE.Vector3(hx, 0.03, hz)));
    }
    tipLine.visible = !!a.tip.edge;
    if (tipLine.visible) {
      tipGeo.attributes.position.array.set([x, 0.03, z, a.tip.edge[0], 0.03, a.tip.edge[1]]);
      tipGeo.attributes.position.needsUpdate = true;
    }
  }

  // ── Tool gizmos and ghost preview (overlay) ──
  const toolGroup = new THREE.Group();
  overlay.add(toolGroup);
  const ghostGeo = new THREE.BufferGeometry();
  const ghost = new THREE.Mesh(ghostGeo, new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { color: { value: new THREE.Color(0x7cc4ff) } },
    vertexShader: `varying vec3 vN, vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 color; varying vec3 vN, vV;
      void main(){ float r = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(color, 0.16 + 0.7*r*r); }`,
  }));
  ghost.visible = false;
  overlay.add(ghost);
  function setGhost(mesh) {
    ghost.visible = !!mesh;
    if (!mesh) return;
    ghostGeo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    ghostGeo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    ghostGeo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    ghostGeo.computeBoundingSphere();
  }

  // ── Volume textures for the colour ray-march ──
  let volTex = null;
  function setVolume(vol, baseSigma) {
    if (!volTex || volTex.n !== vol.n) {
      if (volTex) { volTex.a.dispose(); volTex.b.dispose(); }
      volTex = createVolumeTextures(vol.n);
      glassMat.uniforms.tVolA.value = volTex.a;
      glassMat.uniforms.tVolB.value = volTex.b;
    }
    fillVolumeTextures(volTex, vol, baseSigma);
    glassMat.uniforms.gridOrigin.value.fromArray(vol.origin);
    glassMat.uniforms.gridH.value = vol.h;
    glassMat.uniforms.gridN.value = vol.n;
  }

  // ── Picking ──
  const raycaster = new THREE.Raycaster();
  function rayAt(cssX, cssY) {
    raycaster.setFromCamera(new THREE.Vector2(cssX / canvas.clientWidth * 2 - 1, -(cssY / canvas.clientHeight * 2 - 1)), camera);
    return raycaster;
  }
  function pickGlass(cssX, cssY) {
    const hit = rayAt(cssX, cssY).intersectObject(glass, false)[0];
    if (!hit) return null;
    const n = new THREE.Vector3();
    const nA = glassGeo.attributes.normal, f = hit.face;
    for (const i of [f.a, f.b, f.c]) n.add(new THREE.Vector3().fromBufferAttribute(nA, i));
    return { point: hit.point.toArray(), normal: n.normalize().toArray() };
  }
  function pickHandle(cssX, cssY) {
    const handles = toolGroup.children.filter((o) => o.userData.handle);
    const hit = rayAt(cssX, cssY).intersectObjects(handles, false)[0];
    return hit ? hit.object.userData.handle : null;
  }

  // ── Check highlights (red, pulsing) ──
  const highlight = new THREE.Group();
  overlay.add(highlight);
  function setHighlight(points, color = RED) {
    for (const c of [...highlight.children]) { highlight.remove(c); c.geometry.dispose(); c.material.dispose(); }
    for (const p of points || []) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), markerMat(color, 0.55));
      s.position.fromArray(p);
      const r = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), markerMat(color, 0.9));
      r.position.fromArray(p); r.userData.billboard = true;
      highlight.add(s, r);
    }
  }
  // Ease the orbit target (and camera with it) onto a point.
  let focusTo = null;
  function focus(p) { if (p) focusTo = new THREE.Vector3().fromArray(p); }

  // ── Stand for mounted pieces: steel rod down to a slate base ──
  const stand = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 16),
    new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.9, roughness: 0.3 }));
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 1.2, 48),
    new THREE.MeshStandardMaterial({ color: 0x2f2d2b, roughness: 0.6 }));
  stand.add(rod, plinth);
  stand.visible = false;
  scene.add(stand);
  // When mounted the piece is shown lifted onto the stand: everything glass
  // stays where it is and the stand is built underneath to reach it.
  function setStand(point) {
    stand.visible = !!point;
    if (!point) return;
    const top = point[1] + 0.6, bottom = 1.2;
    const L = Math.max(0.5, top - bottom);
    rod.scale.set(1, L, 1);
    rod.position.set(point[0], bottom + L / 2, point[2]);
    plinth.position.set(point[0], 0.6, point[2]);
  }

  const views = {
    hot: { bg: 0x1a1512, floor: 0x2a2320, mode: 1 },
    cold: { bg: 0xf2f0ec, floor: 0xf7f6f3, mode: 0 },
    thickness: { bg: 0xf2f0ec, floor: 0xf7f6f3, mode: 2 },
  };

  function setView(name) {
    const v = views[name];
    glassMat.uniforms.mode.value = v.mode;
    scene.background = new THREE.Color(v.bg);
    floor.material.color.set(v.floor);
    grid.material.color.set(name === 'hot' ? 0xffffff : 0x000000);
  }

  function setMesh({ positions, normals, indices }) {
    glassGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    glassGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    glassGeo.setIndex(new THREE.BufferAttribute(indices, 1));
    glassGeo.computeBoundingSphere();
  }

  // The rod runs from the left edge of the work area to just inside the glass.
  function setPunty(mark) {
    punty.visible = !!mark;
    if (!mark) return;
    const tip = mark[0] + 0.4, start = -45;
    punty.scale.set(1, tip - start, 1);
    punty.position.set((tip + start) / 2, mark[1], mark[2]);
  }

  const size = new THREE.Vector2();
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(size);
    thickRT.setSize(size.x, size.y);
    backRT.setSize(size.x, size.y);
    glassMat.uniforms.resolution.value.copy(size);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function renderFrame() {
    if (focusTo) {
      const d = focusTo.clone().sub(controls.target).multiplyScalar(0.15);
      controls.target.add(d); camera.position.add(d);
      if (d.lengthSq() < 1e-5) focusTo = null;
    }
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 180);
    for (const c of highlight.children) {
      c.scale.setScalar(pulse);
      if (c.userData.billboard) c.quaternion.copy(camera.quaternion);
    }
    controls.update();
    // 1. background without the glass
    glass.visible = false;
    renderer.setRenderTarget(backRT);
    renderer.render(scene, camera);
    glass.visible = true;
    // 2. thickness: clear to 0, then sum ±distances
    const bg = scene.background;
    scene.background = null;
    renderer.setRenderTarget(thickRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(thickScene, camera);
    scene.background = bg;
    // 3. final composite to screen
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    // 4. markers on top
    renderer.autoClear = false;
    renderer.render(overlay, camera);
    renderer.autoClear = true;
  }
  renderer.setAnimationLoop(renderFrame);

  // Glass thickness (cm) under a CSS-pixel position on the canvas.
  const px = floatBlend ? new Float32Array(4) : new Uint16Array(4);
  function thicknessAt(cssX, cssY) {
    const r = renderer.getPixelRatio();
    const x = Math.floor(cssX * r), y = Math.floor(size.y - 1 - cssY * r);
    if (x < 0 || y < 0 || x >= size.x || y >= size.y) return 0;
    renderer.readRenderTargetPixels(thickRT, x, y, 1, 1, px);
    const t = floatBlend ? px[0] : THREE.DataUtils.fromHalfFloat(px[0]);
    return Math.max(t, 0);
  }

  return { THREE, scene, camera, renderer, controls, glassMat, floatBlend, setMesh, setPunty, setView, setMarkers, renderFrame, thicknessAt,
    toolGroup, setGhost, setVolume, rayAt, pickGlass, pickHandle, canvas, glass, setHighlight, focus, setStand };
}

// 10 cm ruler with mm ticks, drawn to a canvas texture and laid on the floor.
function makeRuler() {
  const pxPerCm = 100, len = 10, pad = 0.4, w = len + pad * 2, hCm = 1.6;
  const c = document.createElement('canvas');
  c.width = w * pxPerCm; c.height = hCm * pxPerCm;
  const g = c.getContext('2d');
  g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#2b2620'; g.fillStyle = '#2b2620';
  g.font = '600 26px system-ui, sans-serif'; g.textAlign = 'center';
  for (let mm = 0; mm <= len * 10; mm++) {
    const x = (pad + mm / 10) * pxPerCm;
    const tl = mm % 10 === 0 ? 50 : mm % 5 === 0 ? 34 : 20;
    g.lineWidth = mm % 10 === 0 ? 3 : 1.5;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, tl); g.stroke();
    if (mm % 10 === 0) g.fillText(String(mm / 10), x, 84);
  }
  g.font = '500 22px system-ui, sans-serif';
  g.fillText('cm', w * pxPerCm / 2, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, hCm),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.02, 9);
  return m;
}
