import type { Section } from '../geometry/section';
import type { Vec2 } from '../geometry/profile';

/**
 * A side-on silhouette drawn from the preset's own section: turned shapes mirrored
 * across the axis, rods as a thick stroke along their path, implicit shapes as the
 * circles they're built from.
 */
export function PresetIcon({ section, size = 36 }: { section: Section; size?: number }) {
  const shapes: { d?: string; stroke?: number; circle?: [number, number, number] }[] = [];
  const pts: Vec2[] = []; // everything drawn, for framing
  switch (section.kind) {
    case 'box': {
      const w = section.width;
      const h = section.height;
      shapes.push({ d: `M${-w / 2},0 H${w / 2} V${-h} H${-w / 2} Z` });
      pts.push([-w / 2, 0], [w / 2, h]);
      break;
    }
    case 'lathe':
    case 'lathe-loop': {
      const p = section.kind === 'lathe' ? section.profile : section.loop;
      const mirror = p.map(([r, y]): Vec2 => [-r, y]);
      if (section.kind === 'lathe') shapes.push({ d: toPath([...p, ...mirror.reverse()]) });
      else shapes.push({ d: toPath(p) }, { d: toPath(mirror) });
      pts.push(...p, ...mirror);
      break;
    }
    case 'sweep': {
      const line = section.path.map(([x, y]): Vec2 => [x, y]);
      const r = section.radii.reduce((a, b) => a + b, 0) / section.radii.length;
      shapes.push({ d: `M${line.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join(' L')}${section.closed ? ' Z' : ''}`, stroke: 2 * r });
      section.path.forEach(([x, y], i) => pts.push([x - section.radii[i], y - section.radii[i]], [x + section.radii[i], y + section.radii[i]]));
      break;
    }
    case 'extrude':
      shapes.push({ d: toPath(section.outline) });
      pts.push(...section.outline);
      break;
    case 'implicit':
      if (section.iconOutline) {
        shapes.push({ d: toPath(section.iconOutline) });
        pts.push(...section.iconOutline);
      }
      for (const c of section.icon) {
        shapes.push({ circle: c });
        pts.push([c[0] - c[2], c[1] - c[2]], [c[0] + c[2], c[1] + c[2]]);
      }
      break;
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0, 1e-3) * 1.15;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const line = span / 40;
  return (
    <svg width={size} height={size} viewBox={`${cx - span / 2} ${-cy - span / 2} ${span} ${span}`} aria-hidden>
      {shapes.map((s, i) =>
        s.circle ? (
          <circle key={i} cx={s.circle[0]} cy={-s.circle[1]} r={s.circle[2]} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={line} />
        ) : s.stroke ? (
          <g key={i}>
            <path d={s.d} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={s.stroke} strokeLinecap="round" strokeLinejoin="round" />
            <path d={s.d} fill="none" stroke="currentColor" strokeWidth={line} strokeLinejoin="round" />
          </g>
        ) : (
          <path key={i} d={s.d} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={line} strokeLinejoin="round" />
        ),
      )}
    </svg>
  );
}

const toPath = (pts: Vec2[]) => `M${pts.map(([r, y]) => `${r.toFixed(2)},${(-y).toFixed(2)}`).join(' L')} Z`;
