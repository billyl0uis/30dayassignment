import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { PrimitiveOp } from '../model/types';
import { fromDisplay, sliderStep, toDisplay } from '../model/units';
import { getPreset } from '../presets/registry';
import { withDefaults, type ParamSpec } from '../presets/types';
import { closestOnLine, handleLine, handlePosition, valueAt, type V3 } from '../geometry/handles';
import type { Body } from '../engine/evaluate';
import { beginDrag, endDrag, useDesign } from '../store/designStore';

/**
 * Orange dots on the selected part, one per size that has a handle. Dragging one slides
 * it along its axis and writes the new number straight into the same parameter the
 * inspector field shows, so the two always agree.
 */
export function ParamHandles({ op, body }: { op: PrimitiveOp; body: Body }) {
  const def = getPreset(op.preset);
  const params = withDefaults(def, op.params);
  const specs = def.params.filter((p) => p.handle);
  // Handles are drawn in the part's own space, so undo its scale to keep the dots a steady size.
  const s = new THREE.Vector3().setFromMatrixScale(body.matrix);
  const radius = 4.5 / Math.max(1e-3, (s.x + s.y + s.z) / 3);

  return (
    <group matrix={body.matrix} matrixAutoUpdate={false}>
      {specs.map((spec) => (
        <Handle key={spec.key} op={op} spec={spec} value={params[spec.key]} body={body} radius={radius} />
      ))}
    </group>
  );
}

function Handle({ op, spec, value, body, radius }: { op: PrimitiveOp; spec: ParamSpec; value: number; body: Body; radius: number }) {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const [hot, setHot] = useState(false);
  const drag = useRef<{ inverse: THREE.Matrix4; line: ReturnType<typeof handleLine>; key: string } | null>(null);
  const position = useMemo(() => handlePosition(spec.handle!, value, body.height_mm), [spec, value, body.height_mm]);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    drag.current = { inverse: body.matrix.clone().invert(), line: handleLine(spec.handle!, value, body.height_mm), key: beginDrag() };
    if (controls) controls.enabled = false;
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    // Bring the pointer's ray into the part's own space, where the handle's line is simple.
    const o = e.ray.origin.clone().applyMatrix4(d.inverse);
    const dir = e.ray.origin.clone().add(e.ray.direction).applyMatrix4(d.inverse).sub(o);
    const along = closestOnLine(d.line.origin, d.line.dir, o.toArray() as V3, dir.toArray() as V3);
    if (along === null) return;
    const { snap, design, setParam } = useDesign.getState();
    let next = valueAt(spec.handle!, along);
    if (snap) {
      const step = sliderStep(design.displayUnits);
      next = fromDisplay(Math.round(toDisplay(next, design.displayUnits) / step) * step, design.displayUnits);
    }
    next = Math.min(spec.max, Math.max(spec.min, next));
    if (Math.abs(next - value) > 1e-6) setParam(op.id, spec.key, next, d.key);
  };

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    endDrag();
    if (controls) controls.enabled = true;
  };

  return (
    <mesh
      position={position}
      renderOrder={10}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onClick={(e) => e.stopPropagation()}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHot(true);
        document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        setHot(false);
        document.body.style.cursor = '';
      }}
    >
      <sphereGeometry args={[radius * (hot ? 1.35 : 1), 16, 12]} />
      <meshBasicMaterial color={hot ? '#ffd08a' : '#e8a33d'} depthTest={false} transparent />
    </mesh>
  );
}
