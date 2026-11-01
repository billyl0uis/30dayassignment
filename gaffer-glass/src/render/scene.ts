import { GEOM } from '../config';
import type { HoldAction, Mods } from '../sim/actions';
import { clamp, geometry, type Piece } from '../sim/piece';
import { glassAlpha, glassRGB, glowAmount, heatRGB, mix, rgba, type RGB } from './heat';
import { profile, type Profile } from './profile';

export interface SceneView {
  piece: Piece | null;
  tool: HoldAction | null; // the tool actually working right now
  turnPhase: number; // 0–1, advances while the pipe turns
  turning: boolean;
  mods: Mods;
  time: number; // seconds, for animation
}

const STATION_LABEL: Record<HoldAction, string> = {
  gather: 'Furnace · gather',
  glory: 'Glory hole',
  marver: 'Marver',
  block: 'Block',
  blow: 'Blow',
  jacks: 'Jacks',
  turn: 'Turning',
};

const UI_FONT = '"IBM Plex Sans", system-ui, sans-serif';

/** Side view of the hot shop bay. Owns only its camera; everything else comes in per frame. */
export class Scene {
  private ctx: CanvasRenderingContext2D;
  private cam = { x: 1, y: 0, scale: 50 };
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  private fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w !== this.w || h !== this.h || this.canvas.width !== Math.round(w * dpr)) {
      this.w = w;
      this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // World (inches, y down) → screen (CSS px).
  private X = (x: number) => this.w * 0.5 + (x - this.cam.x) * this.cam.scale;
  private Y = (y: number) => this.h * 0.42 + (y - this.cam.y) * this.cam.scale;
  private S = (d: number) => d * this.cam.scale;

  draw(v: SceneView, dt: number) {
    this.fit();
    const { ctx, w, h } = this;
    const p = v.piece;
    const pr = p && p.V > 0 ? profile(p) : null;
    const floorY = h * 0.8;

    // Auto-zoom: ease toward a frame that fits the piece, the pipe end, and a station margin.
    const len = Math.max(pr?.length ?? 0, 3.5);
    const maxR = Math.max(pr?.maxR ?? 0, 1.5);
    const maxDrop = pr ? pr.drop[pr.drop.length - 1] : 0;
    const scale = clamp(Math.min(w / (len + 4.5), (h * 0.62) / (2 * maxR + maxDrop + 1.6)), 8, Math.min(w, h) / 10);
    const k = Math.min(1, dt * 3);
    this.cam.scale += (scale - this.cam.scale) * k;
    this.cam.x += (len / 2 - 0.4 - this.cam.x) * k;
    this.cam.y += (maxDrop / 2 - this.cam.y) * k;

    const T = p?.T ?? 70;
    const glow = p && p.V > 0 ? glowAmount(T) : 0;
    const heat = heatRGB(T);

    this.background(floorY);

    // Floor light under the piece.
    if (glow > 0) {
      const fx = this.X(len / 2);
      const g = ctx.createRadialGradient(fx, floorY, 0, fx, floorY, w * 0.45);
      g.addColorStop(0, rgba(heat, 0.32 * glow));
      g.addColorStop(1, rgba(heat, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, floorY - h * 0.1, w, h);
    }

    if (v.tool && pr) this.stationBehind(v.tool, pr, v);

    this.rod(p);

    if (p && pr) {
      if (p.failed?.kind === 'floor') this.puddle(pr, p, floorY, heat, glow);
      else this.glass(pr, p, v, heat, glow);
    }

    if (v.tool) {
      if (pr) this.stationFront(v.tool, pr, p!, v);
      const label = v.tool === 'block' && v.mods.pad ? 'Newspaper pad' : STATION_LABEL[v.tool];
      this.chip(label, 12, 12);
    } else if (v.turning && p && !p.failed) {
      this.chip('Assistant turning', 12, 12, true);
    }
  }

  private room?: { w: number; h: number; img: HTMLCanvasElement };

  /** The shop itself, in screen space. Painted once per size and reused every frame. */
  private background(floorY: number) {
    const { w, h } = this;
    if (!this.room || this.room.w !== w || this.room.h !== h) {
      const dpr = this.canvas.width / w;
      const img = document.createElement('canvas');
      img.width = this.canvas.width;
      img.height = this.canvas.height;
      const c = img.getContext('2d')!;
      c.scale(dpr, dpr);
      paintRoom(c, w, h, floorY);
      this.room = { w, h, img };
    }
    this.ctx.drawImage(this.room.img, 0, 0, w, h);
  }

  /** The blowpipe, or after transfer the thinner solid punty. */
  private rod(p: Piece | null) {
    const { ctx } = this;
    const onPunty = !!p?.punty;
    const r = onPunty ? GEOM.puntyR : GEOM.pipeR;
    const end = onPunty ? 0.15 : 0.3;
    const x0 = -40;
    const g = ctx.createLinearGradient(0, this.Y(-r), 0, this.Y(r));
    if (onPunty) {
      g.addColorStop(0, '#5a5551');
      g.addColorStop(0.45, '#2c2927');
      g.addColorStop(1, '#141211');
    } else {
      g.addColorStop(0, '#8a8f93');
      g.addColorStop(0.4, '#4c5054');
      g.addColorStop(1, '#1b1d1f');
    }
    ctx.fillStyle = g;
    ctx.fillRect(this.X(x0), this.Y(-r), this.X(end) - this.X(x0), this.S(2 * r));
    if (!onPunty) {
      // Bore of the pipe, so it reads as a tube.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(this.X(x0), this.Y(-0.06), this.X(end) - this.X(x0), this.S(0.12));
    }
    // Heat scale on the end of the rod.
    if (p && p.V > 0) {
      const t = ctx.createLinearGradient(this.X(end - 3), 0, this.X(end), 0);
      t.addColorStop(0, 'rgba(160, 40, 10, 0)');
      t.addColorStop(1, rgba(heatRGB(Math.min(p.T, 1500)), 0.45));
      ctx.fillStyle = t;
      ctx.fillRect(this.X(end - 3), this.Y(-r), this.S(3), this.S(2 * r));
    }
  }

  private outline(pr: Profile, radii: number[], from = 0, to = pr.xs.length - 1) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = from; i <= to; i++) ctx.lineTo(this.X(pr.xs[i]), this.Y(pr.drop[i] - radii[i]));
    for (let i = to; i >= from; i--) ctx.lineTo(this.X(pr.xs[i]), this.Y(pr.drop[i] + radii[i]));
    ctx.closePath();
  }

  private glass(pr: Profile, p: Piece, v: SceneView, heat: RGB, glow: number) {
    const { ctx } = this;
    const base = glassRGB(p.color);
    const a = glassAlpha(p.color);
    const body = mix(base, heat, glow);
    const alpha = a + (1 - a) * glow;

    // Body, with a halo of heat around it.
    ctx.save();
    this.outline(pr, pr.outer);
    ctx.shadowColor = rgba(heat, 0.9 * glow);
    ctx.shadowBlur = 46 * glow;
    ctx.fillStyle = rgba(body, alpha);
    ctx.fill();
    ctx.restore();

    // Shading across the body so it reads as round.
    ctx.save();
    this.outline(pr, pr.outer);
    ctx.clip();
    const top = this.Y(-pr.maxR);
    const bot = this.Y(pr.maxR + pr.drop[pr.drop.length - 1]);
    const sh = ctx.createLinearGradient(0, top, 0, bot);
    sh.addColorStop(0, `rgba(255,255,255,${0.18 * (1 - glow) + 0.12 * glow})`);
    sh.addColorStop(0.45, 'rgba(255,255,255,0)');
    sh.addColorStop(1, `rgba(0,0,0,${0.35 - 0.2 * glow})`);
    ctx.fillStyle = sh;
    ctx.fillRect(this.X(-1), top - 4, this.S(pr.length + 2), bot - top + 8);

    // The bubble: darker inside, open at the lip after transfer.
    const firstIn = pr.inner.findIndex((r) => r > 0.01);
    if (firstIn >= 0) {
      let lastIn = firstIn;
      for (let i = firstIn; i < pr.inner.length; i++) if (pr.inner[i] > 0.01) lastIn = i;
      this.outline(pr, pr.inner, firstIn, lastIn);
      const cavity = glow > 0.05 ? mix(heat, [30, 6, 2], 0.62) : mix(base, [8, 8, 10], 0.75);
      ctx.fillStyle = rgba(cavity, glow > 0.05 ? 0.6 + 0.3 * glow : p.color === 'opal' ? 0.35 : 0.5);
      ctx.fill();
    }

    // Turning: highlight stripes riding around the axis.
    if (v.turning || v.tool) {
      for (let s = 0; s < 6; s++) {
        const th = 2 * Math.PI * (s / 6 + v.turnPhase);
        const front = Math.sin(th);
        if (front <= 0.05) continue;
        ctx.beginPath();
        for (let i = 0; i < pr.xs.length; i++) ctx.lineTo(this.X(pr.xs[i]), this.Y(pr.drop[i] - pr.outer[i] * Math.cos(th)));
        ctx.lineWidth = Math.max(1, this.S(0.1) * front);
        ctx.strokeStyle = `rgba(255,255,255,${(0.07 + 0.08 * (1 - glow)) * front})`;
        ctx.stroke();
      }
    }

    if (p.failed?.kind === 'crack') this.cracks(pr);
    ctx.restore();

    // Rim light.
    this.outline(pr, pr.outer);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = glow > 0.1 ? rgba(mix(heat, [255, 255, 255], 0.3), 0.6 * glow) : 'rgba(38,52,60,0.55)';
    ctx.stroke();
  }

  private cracks(pr: Profile) {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.4;
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let c = 0; c < 4; c++) {
      let x = pr.length * (0.15 + 0.7 * rnd());
      let y = -pr.maxR;
      ctx.beginPath();
      ctx.moveTo(this.X(x), this.Y(y));
      while (y < pr.maxR * 1.2) {
        x += (rnd() - 0.5) * pr.maxR * 0.5;
        y += pr.maxR * (0.15 + 0.2 * rnd());
        ctx.lineTo(this.X(x), this.Y(y));
      }
      ctx.stroke();
    }
  }

  /** A slumped or dropped piece lying on the shop floor. */
  private puddle(pr: Profile, p: Piece, floorY: number, heat: RGB, glow: number) {
    const { ctx } = this;
    const cx = this.X(pr.length * 0.7);
    const rx = this.S(pr.length * 0.55 + pr.maxR * 0.5);
    const ry = Math.max(4, this.S(pr.maxR * 0.45));
    ctx.save();
    ctx.shadowColor = rgba(heat, 0.8 * glow);
    ctx.shadowBlur = 30 * glow;
    ctx.fillStyle = rgba(mix(glassRGB(p.color), heat, glow), 0.6 + 0.4 * glow);
    ctx.beginPath();
    ctx.ellipse(cx, floorY - ry * 0.6, rx, ry, 0, Math.PI, 2 * Math.PI);
    ctx.lineTo(cx + rx, floorY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private stationBehind(tool: HoldAction, pr: Profile, v: SceneView) {
    const { ctx } = this;
    const len = pr.length;
    const R = pr.maxR;
    const dropEnd = pr.drop[pr.drop.length - 1];
    switch (tool) {
      case 'gather': {
        const x0 = this.X(-0.6), x1 = this.X(len + 3.5);
        const y0 = this.Y(-R - 1.3), y1 = this.Y(R + dropEnd + 1);
        const g = ctx.createRadialGradient(this.X(len / 2), this.Y(0), 0, this.X(len / 2), this.Y(0), x1 - x0);
        g.addColorStop(0, '#ffe3a0');
        g.addColorStop(0.35, '#ff9a2e');
        g.addColorStop(1, '#5c1804');
        ctx.fillStyle = g;
        roundRect(ctx, x0, y0, x1 - x0, y1 - y0, this.S(1.2));
        ctx.fill();
        // Pool of molten glass in the crucible.
        ctx.fillStyle = 'rgba(255, 236, 170, 0.75)';
        ctx.fillRect(x0, this.Y(R * 0.35), x1 - x0, y1 - this.Y(R * 0.35));
        ctx.lineWidth = this.S(0.45);
        ctx.strokeStyle = '#2a1d17';
        roundRect(ctx, x0, y0, x1 - x0, y1 - y0, this.S(1.2));
        ctx.stroke();
        return;
      }
      case 'glory': {
        const cx = this.X(len * 0.6), cy = this.Y(dropEnd / 2);
        const rr = this.S(R + 1.4 + len * 0.25);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, '#ffd27a');
        g.addColorStop(0.6, '#ff6a14');
        g.addColorStop(1, '#4a1203');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = this.S(0.6);
        ctx.strokeStyle = '#2b211c';
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 190, 110, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, rr - this.S(0.3), 0, Math.PI * 2);
        ctx.stroke();
        return;
      }
      case 'marver': {
        const y = this.Y(R + dropEnd * 0.5 + 0.02);
        const x0 = this.X(-1.5), x1 = this.X(len + 2.5);
        const g = ctx.createLinearGradient(0, y, 0, y + this.S(0.9));
        g.addColorStop(0, '#9aa1a6');
        g.addColorStop(0.15, '#5f666b');
        g.addColorStop(1, '#22262a');
        ctx.fillStyle = g;
        ctx.fillRect(x0, y, x1 - x0, this.S(0.9));
        // Legs.
        ctx.fillStyle = '#1c1f22';
        ctx.fillRect(x0 + this.S(0.6), y + this.S(0.9), this.S(0.3), this.h);
        ctx.fillRect(x1 - this.S(0.9), y + this.S(0.9), this.S(0.3), this.h);
        return;
      }
      case 'blow': {
        // Breath puffs at the pipe mouth, off to the left.
        for (let i = 0; i < 4; i++) {
          const t = (v.time * 0.9 + i / 4) % 1;
          ctx.fillStyle = `rgba(150, 160, 175, ${0.3 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(14 + t * 46, this.Y(0) - t * 16, 5 + t * 12, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      default:
        return;
    }
  }

  private stationFront(tool: HoldAction, pr: Profile, p: Piece, v: SceneView) {
    const { ctx } = this;
    const len = pr.length;
    switch (tool) {
      case 'block': {
        // A wet cherrywood cup cradling the free end, steaming.
        const g = geometry(p);
        const cx = this.X(Math.max(len - g.R, len * 0.5));
        const cy = this.Y(pr.drop[pr.drop.length - 1] * 0.8);
        const rr = this.S(Math.max(g.R, 0.6) + 0.25);
        ctx.lineWidth = this.S(0.32);
        ctx.strokeStyle = v.mods.pad ? '#cfc6b4' : '#6b4325';
        ctx.beginPath();
        ctx.arc(cx, cy, rr, Math.PI * 0.08, Math.PI * 0.92);
        ctx.stroke();
        ctx.lineWidth = this.S(0.18);
        ctx.strokeStyle = v.mods.pad ? '#a39985' : '#4d2f19';
        ctx.beginPath();
        ctx.moveTo(cx + rr * 0.5, cy + rr * 0.85);
        ctx.lineTo(cx + rr * 1.6, cy + rr * 2.2);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const t = (v.time * 0.7 + i / 3) % 1;
          ctx.fillStyle = `rgba(160, 165, 172, ${0.28 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(cx + (i - 1) * rr * 0.6, cy - this.S(g.R) - t * 40, 6 + t * 10, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      case 'jacks': {
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#b8bec3';
        ctx.lineWidth = Math.max(2, this.S(0.09));
        if (!p.punty) {
          const i = Math.round((pr.neckX / Math.max(len, 1e-3)) * (pr.xs.length - 1));
          const rN = pr.outer[Math.max(0, Math.min(i, pr.outer.length - 1))];
          const d = pr.drop[Math.max(0, Math.min(i, pr.drop.length - 1))];
          for (const sgn of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(this.X(pr.neckX - 1.2), this.Y(d + sgn * (rN + 2.2)));
            ctx.lineTo(this.X(pr.neckX), this.Y(d + sgn * rN));
            ctx.stroke();
          }
        } else {
          const last = pr.outer.length - 1;
          const lip = pr.outer[last];
          const d = pr.drop[last];
          const depth = Math.min(1.2, len * 0.3);
          for (const sgn of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(this.X(len + 1.6), this.Y(d + sgn * (lip + 1.3)));
            ctx.lineTo(this.X(len - depth), this.Y(d + sgn * Math.max(lip - 0.15, 0.1)));
            ctx.stroke();
          }
        }
        return;
      }
      default:
        return;
    }
  }

  private chip(text: string, x: number, y: number, quiet = false) {
    const { ctx } = this;
    ctx.font = `600 13px ${UI_FONT}`;
    const label = text;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(28, 32, 40, 0.88)';
    roundRect(ctx, x, y, tw + 20, 26, 8);
    ctx.fill();
    ctx.fillStyle = quiet ? '#9aa4b2' : '#ffb067';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 10, y + 13.5);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/**
 * A daylit hot shop: whitewashed block wall, a big steel-sash window throwing light across the
 * concrete, the furnace at the left, the glory hole at the right and a shelf of color jars.
 */
function paintRoom(c: CanvasRenderingContext2D, w: number, h: number, floorY: number) {
  const wall = c.createLinearGradient(0, 0, 0, floorY);
  wall.addColorStop(0, '#f1eee8');
  wall.addColorStop(1, '#dcd7ce');
  c.fillStyle = wall;
  c.fillRect(0, 0, w, floorY);
  // Block coursing.
  c.strokeStyle = 'rgba(120, 110, 95, 0.09)';
  c.lineWidth = 1;
  const course = Math.max(18, h / 28);
  for (let y = course, row = 0; y < floorY; y += course, row++) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
    for (let x = (row % 2) * course; x < w; x += course * 2) {
      c.beginPath();
      c.moveTo(x, y - course);
      c.lineTo(x, y);
      c.stroke();
    }
  }

  // Window, high and centered, with its light falling across the floor.
  const ww = Math.min(w * 0.34, 420), wh = floorY * 0.36;
  const wx = w * 0.5 - ww / 2, wy = floorY * 0.08;
  const sky = c.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, '#bcd9ea');
  sky.addColorStop(1, '#e4f0f4');
  c.fillStyle = sky;
  c.fillRect(wx, wy, ww, wh);
  c.strokeStyle = '#59626a';
  c.lineWidth = 4;
  c.strokeRect(wx, wy, ww, wh);
  c.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    c.beginPath();
    c.moveTo(wx + (ww * i) / 4, wy);
    c.lineTo(wx + (ww * i) / 4, wy + wh);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(wx, wy + wh / 2);
  c.lineTo(wx + ww, wy + wh / 2);
  c.stroke();

  // Shelf of color jars, upper right.
  const sx = w * 0.74, sy = floorY * 0.3, sw = Math.min(w * 0.22, 260);
  c.fillStyle = '#8a6a4a';
  c.fillRect(sx, sy, sw, 6);
  const jars = ['#2646c4', '#cd801e', '#28a06e', '#ece8dc', '#c81c4c', '#2646c4', '#cd801e'];
  const jw = sw / jars.length;
  jars.forEach((col, i) => {
    const jh = 20 + ((i * 7) % 3) * 6;
    c.fillStyle = col;
    c.globalAlpha = 0.85;
    c.fillRect(sx + i * jw + 4, sy - jh, jw - 8, jh);
    c.globalAlpha = 1;
    c.fillStyle = '#3a3f46';
    c.fillRect(sx + i * jw + 3, sy - jh - 4, jw - 6, 5);
  });

  // Furnace, left: a steel box on legs with the glowing door.
  const fw = Math.min(w * 0.2, 240), fh = floorY * 0.62;
  const fx = -fw * 0.25, fy = floorY - fh;
  c.fillStyle = '#6f777e';
  c.fillRect(fx, fy, fw, fh * 0.82);
  c.fillStyle = '#4e555b';
  c.fillRect(fx, fy, fw, 8);
  c.fillRect(fx + 10, fy + fh * 0.82, 10, fh * 0.18);
  c.fillRect(fx + fw - 20, fy + fh * 0.82, 10, fh * 0.18);
  const dx = fx + fw * 0.32, dy = fy + fh * 0.3, dw = fw * 0.55, dh = fh * 0.3;
  c.fillStyle = '#9c4a2a';
  c.fillRect(dx - 6, dy - 6, dw + 12, dh + 12);
  const door = c.createRadialGradient(dx + dw / 2, dy + dh / 2, 0, dx + dw / 2, dy + dh / 2, dw * 0.7);
  door.addColorStop(0, '#fff1c4');
  door.addColorStop(0.5, '#ffa23a');
  door.addColorStop(1, '#d4521a');
  c.fillStyle = door;
  c.fillRect(dx, dy, dw, dh);
  const spill = c.createRadialGradient(dx + dw / 2, dy + dh / 2, 0, dx + dw / 2, dy + dh / 2, fw * 1.2);
  spill.addColorStop(0, 'rgba(255, 150, 60, 0.22)');
  spill.addColorStop(1, 'rgba(255, 150, 60, 0)');
  c.fillStyle = spill;
  c.fillRect(0, 0, fx + fw * 2.4, h);

  // Glory hole, right: a drum on a stand with its round port.
  const gr = Math.min(w * 0.09, 110);
  const gx = w + gr * 0.15, gy = floorY - gr * 2.1;
  c.fillStyle = '#4e555b';
  c.fillRect(gx - gr * 0.5, gy + gr * 0.8, 12, floorY - gy - gr * 0.8);
  c.fillStyle = '#7b838a';
  c.beginPath();
  c.arc(gx, gy, gr * 1.1, 0, Math.PI * 2);
  c.fill();
  const port = c.createRadialGradient(gx - gr * 0.2, gy, 0, gx - gr * 0.2, gy, gr * 0.6);
  port.addColorStop(0, '#fff0c0');
  port.addColorStop(0.6, '#ff8a2a');
  port.addColorStop(1, '#b8400f');
  c.fillStyle = port;
  c.beginPath();
  c.arc(gx - gr * 0.2, gy, gr * 0.55, 0, Math.PI * 2);
  c.fill();

  // Concrete floor, lighter where the window lands.
  const floor = c.createLinearGradient(0, floorY, 0, h);
  floor.addColorStop(0, '#bdb7ac');
  floor.addColorStop(1, '#cfcac0');
  c.fillStyle = floor;
  c.fillRect(0, floorY, w, h - floorY);
  c.fillStyle = 'rgba(255, 252, 240, 0.4)';
  c.beginPath();
  c.moveTo(wx + ww * 0.1, floorY);
  c.lineTo(wx + ww * 1.1, floorY);
  c.lineTo(wx + ww * 1.5, h);
  c.lineTo(wx + ww * 0.3, h);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(70, 64, 56, 0.25)';
  c.fillRect(0, floorY, w, 2);
}
