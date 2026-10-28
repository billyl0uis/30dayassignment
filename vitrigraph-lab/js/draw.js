/* Vitrigraph Lab: shared canvas drawing (pot cross-section, top view, cane slices). */
(function (VL) {
  const D = {};

  D.fit = function (canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };

  D.hex = id => VL.model.colorById(id).hex;

  // Small texture marks so chunks, frit and scrap read differently.
  D.formMarks = function (ctx, form, x, y, w, h, seed) {
    ctx.save();
    if (form === 'frit') {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let k = 0; k < 4; k++) {
        const a = Math.sin(seed * 12.9 + k * 78.2) * 43758.5, b = Math.sin(seed * 4.1 + k * 31.7) * 15731.7;
        ctx.fillRect(x + (a - Math.floor(a)) * (w - 2), y + (b - Math.floor(b)) * (h - 2), 1.6, 1.6);
      }
    } else if (form === 'scrap') {
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w * 0.15, y + h * 0.8); ctx.lineTo(x + w * 0.85, y + h * 0.25); ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
    ctx.restore();
  };

  // ---------- pot cross-section (slice through sectors k and k+S/2) ----------

  D.potGeo = function (w, h) {
    const P = VL.config.pot;
    const H = Math.min(h * 0.78, w * 1.05), topW = Math.min(w * 0.82, H * 1.0), botW = topW * 0.62;
    const cx = w / 2, bottom = (h + H) / 2 - 6, top = bottom - H;
    const rowH = H / P.layers;
    return {
      cx, top, bottom, topW, botW, rowH, H,
      halfAt: y => (botW + (topW - botW) * (bottom - y) / H) / 2,
      // Cell under a point: { l, r, side: -1 left / +1 right } or null
      hit(x, y) {
        if (y < top || y > bottom) return null;
        const l = Math.min(P.layers - 1, Math.floor((bottom - y) / rowH));
        const hw = this.halfAt(bottom - (l + 0.5) * rowH), dx = x - cx;
        if (Math.abs(dx) > hw) return null;
        return { l, r: Math.min(P.rings - 1, Math.floor(Math.abs(dx) / hw * P.rings)), side: dx < 0 ? -1 : 1 };
      },
    };
  };

  D.sideSector = (sliceRot, side) => side > 0 ? sliceRot : (sliceRot + VL.config.pot.sectors / 2) % VL.config.pot.sectors;

  // stacks: per (r, sector) arrays of {cell, y} in layer units (0 = pot floor).
  D.drawPot = function (ctx, g, stacks, sliceRot, opts) {
    const P = VL.config.pot, o = opts || {};
    // pot wall (terra cotta), drawn as a thick trapezoid with a hole at the bottom
    const wall = 9, holeW = Math.max(8, g.botW * 0.12);
    ctx.save();
    ctx.fillStyle = o.glow ? `rgba(255,140,40,${0.12 + 0.3 * o.glow})` : 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.moveTo(g.cx - g.topW / 2, g.top); ctx.lineTo(g.cx + g.topW / 2, g.top);
    ctx.lineTo(g.cx + g.botW / 2, g.bottom); ctx.lineTo(g.cx - g.botW / 2, g.bottom); ctx.closePath(); ctx.fill();

    for (const side of [-1, 1]) {
      const s = D.sideSector(sliceRot, side);
      for (let r = 0; r < P.rings; r++) {
        for (const it of stacks[r * P.sectors + s]) {
          const yb = g.bottom - it.y * g.rowH, yt = yb - g.rowH;
          if (yt > g.bottom + 0.5) continue;
          const hw = g.halfAt((yb + yt) / 2), x0 = g.cx + side * (r / P.rings) * hw, x1 = g.cx + side * ((r + 1) / P.rings) * hw;
          const x = Math.min(x0, x1), cw = Math.abs(x1 - x0);
          ctx.fillStyle = D.hex(it.cell.c);
          ctx.fillRect(x, Math.max(yt, g.top), cw + 0.6, Math.min(g.rowH, yb - Math.max(yt, g.top)) + 0.6);
          if (!o.melted) D.formMarks(ctx, it.cell.form, x, yt, cw, g.rowH, it.y * 7 + r * 3 + side);
        }
      }
    }
    if (o.glow) {
      ctx.fillStyle = `rgba(255,120,30,${0.25 * o.glow})`;
      ctx.beginPath();
      ctx.moveTo(g.cx - g.topW / 2, g.top); ctx.lineTo(g.cx + g.topW / 2, g.top);
      ctx.lineTo(g.cx + g.botW / 2, g.bottom); ctx.lineTo(g.cx - g.botW / 2, g.bottom); ctx.closePath(); ctx.fill();
    }
    // grid while loading
    if (o.grid) {
      ctx.strokeStyle = 'rgba(31,35,33,.13)'; ctx.lineWidth = 1;
      for (let l = 0; l <= P.layers; l++) {
        const y = g.bottom - l * g.rowH, hw = g.halfAt(y);
        ctx.beginPath(); ctx.moveTo(g.cx - hw, y); ctx.lineTo(g.cx + hw, y); ctx.stroke();
      }
      for (let r = 0; r <= P.rings; r++) for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(g.cx + side * (r / P.rings) * g.topW / 2, g.top);
        ctx.lineTo(g.cx + side * (r / P.rings) * g.botW / 2, g.bottom); ctx.stroke();
      }
      if (o.hover) {
        const { l, r, side } = o.hover, y = g.bottom - (l + 0.5) * g.rowH, hw = g.halfAt(y);
        ctx.strokeStyle = '#1f2321'; ctx.lineWidth = 2;
        const rs = o.brush === 'ring' ? [-1, 1] : [side];
        for (const sd of rs) {
          const x0 = g.cx + sd * (r / P.rings) * hw, x1 = g.cx + sd * ((r + 1) / P.rings) * hw;
          ctx.strokeRect(Math.min(x0, x1), y - g.rowH / 2, Math.abs(x1 - x0), g.rowH);
        }
      }
    }
    // walls
    ctx.strokeStyle = '#a35a37'; ctx.lineWidth = wall; ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(g.cx + side * (g.topW / 2 + wall / 2), g.top - 4);
      ctx.lineTo(g.cx + side * (g.botW / 2 + wall / 2), g.bottom + wall / 2);
      ctx.lineTo(g.cx + side * holeW / 2, g.bottom + wall / 2);
      ctx.stroke();
    }
    ctx.restore();
    return holeW;
  };

  // Stacks for the unmelted charge.
  D.chargeStacks = function (ch) {
    const out = [];
    for (let r = 0; r < ch.R; r++) for (let s = 0; s < ch.S; s++) {
      const a = [];
      for (let l = 0; l < ch.L; l++) { const c = ch.cells[VL.model.idx(ch, l, r, s)]; if (c) a.push({ cell: c, y: l }); }
      out.push(a);
    }
    return out;
  };

  // Stacks partway through slumping (t 0→1), or drained (from a drain state).
  D.slumpStacks = function (ch, t) {
    return D.chargeStacks(ch).map(a => a.map((it, k) => ({ cell: it.cell, y: it.y + (k - it.y) * t })));
  };
  D.drainStacks = function (d) {
    return d.cols.map((col, i) => {
      const a = [], p = d.pos[i];
      for (let k = Math.floor(p); k < col.length; k++) a.push({ cell: col[k], y: k - p });
      return a;
    });
  };

  // ---------- top view of one layer ----------

  D.drawTop = function (ctx, ch, layer, cx, cy, rad, sliceRot, hover) {
    const { R, S } = ch;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    for (let r = 0; r < R; r++) for (let s = 0; s < S; s++) {
      const c = ch.cells[VL.model.idx(ch, layer, r, s)];
      const a0 = (s - 0.5) / S * Math.PI * 2, a1 = (s + 0.5) / S * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx, cy, rad * (r + 1) / R, a0, a1); ctx.arc(cx, cy, rad * r / R, a1, a0, true); ctx.closePath();
      if (c) { ctx.fillStyle = D.hex(c.c); ctx.fill(); }
      ctx.strokeStyle = 'rgba(31,35,33,.18)'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (hover) {
      ctx.strokeStyle = '#1f2321'; ctx.lineWidth = 2;
      for (const s of hover.sectors) {
        const a0 = (s - 0.5) / S * Math.PI * 2, a1 = (s + 0.5) / S * Math.PI * 2;
        ctx.beginPath(); ctx.arc(cx, cy, rad * (hover.r + 1) / R, a0, a1); ctx.arc(cx, cy, rad * hover.r / R, a1, a0, true); ctx.closePath(); ctx.stroke();
      }
    }
    // slice line: the plane the side view shows
    const a = sliceRot / S * Math.PI * 2;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#8e2c25'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * (rad + 8), cy - Math.sin(a) * (rad + 8)); ctx.lineTo(cx + Math.cos(a) * (rad + 8), cy + Math.sin(a) * (rad + 8)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#8e2c25'; ctx.font = '600 10px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
    ctx.fillText('R', cx + Math.cos(a) * (rad + 16), cy + Math.sin(a) * (rad + 16) + 3);
    ctx.fillText('L', cx - Math.cos(a) * (rad + 16), cy - Math.sin(a) * (rad + 16) + 3);
    ctx.strokeStyle = '#a35a37'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, rad + 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  D.topHit = function (x, y, cx, cy, rad) {
    const P = VL.config.pot, dx = x - cx, dy = y - cy, rr = Math.hypot(dx, dy);
    if (rr > rad) return null;
    let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI * 2;
    return { r: Math.min(P.rings - 1, Math.floor(rr / rad * P.rings)), s: Math.round(a / (Math.PI * 2) * P.sectors) % P.sectors };
  };

  // ---------- cane slice (murrini) ----------

  D.drawSlice = function (ctx, sl, cx, cy, rad, rot, aspect, opts) {
    const o = opts || {}, geo = VL.model.sliceGeometry(sl);
    ctx.save();
    ctx.translate(cx, cy);
    if (aspect && aspect !== 1) ctx.scale(Math.sqrt(aspect), 1 / Math.sqrt(aspect));
    ctx.rotate(rot || 0);
    if (!geo.length) {
      ctx.strokeStyle = '#858c87'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.restore(); return;
    }
    for (const w of geo) {
      ctx.beginPath();
      ctx.arc(0, 0, rad * w.r1, w.a0, w.a1); ctx.arc(0, 0, rad * w.r0, w.a1, w.a0, true); ctx.closePath();
      ctx.fillStyle = D.hex(w.c); ctx.fill();
      ctx.strokeStyle = D.hex(w.c); ctx.lineWidth = 0.8; ctx.stroke();   // hide hairline seams
      if (w.form === 'frit' && o.seeds) {
        const n = Math.round(VL.config.fritBubbleChance * 3 * (w.r1 - w.r0) * (w.a1 - w.a0) * 2);
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        for (let k = 0; k < n; k++) {
          const t = Math.abs(Math.sin((w.a0 + k) * 91.7)), u = Math.abs(Math.sin((w.r0 + k) * 47.3));
          const aa = w.a0 + (w.a1 - w.a0) * t, rr = rad * (w.r0 + (w.r1 - w.r0) * u);
          ctx.beginPath(); ctx.arc(Math.cos(aa) * rr, Math.sin(aa) * rr, Math.max(0.8, rad * 0.025), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // a little gloss so transparent and opaque read differently
    const grd = ctx.createRadialGradient(-rad * 0.35, -rad * 0.35, rad * 0.05, 0, 0, rad);
    grd.addColorStop(0, 'rgba(255,255,255,.28)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(31,35,33,.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  };

  // Color seen from the side: the outer glass facing you, with transparent glass letting the inside tint through.
  D.sideColor = function (sl, rot) {
    const geo = VL.model.sliceGeometry(sl);
    if (!geo.length) return '#999';
    let face = -Math.PI / 2 - (rot || 0);   // facing the viewer
    const hits = geo.filter(w => {
      let t = face; while (t < w.a0) t += Math.PI * 2; while (t >= w.a0 + Math.PI * 2) t -= Math.PI * 2;
      return t < w.a1;
    }).sort((a, b) => b.r1 - a.r1);
    let rgb = null, keep = 1;
    for (const w of hits) {
      const col = VL.model.colorById(w.c), c = hexRgb(col.hex), a = col.opaque ? 1 : 0.45;
      rgb = rgb ? rgb.map((v, i) => v + c[i] * a * keep) : c.map(v => v * a);
      keep *= 1 - a;
      if (keep < 0.05) break;
    }
    if (keep > 0) rgb = rgb.map(v => v + 230 * keep);
    return `rgb(${rgb.map(v => Math.round(Math.min(255, v))).join(',')})`;
  };

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  D.hexRgb = hexRgb;

  VL.draw = D;
})(window.VitrigraphLab);
