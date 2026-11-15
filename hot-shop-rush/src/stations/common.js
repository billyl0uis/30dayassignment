import { STEPS, STATIONS } from '../config.js';
import { stepOf, fritById } from '../game.js';
import { PAL, box, text, banner, rgbStr } from '../draw.js';
import { DENSITY_LABEL } from '../customers.js';

// Size of the piece in profile, from bubble size (b) × gather size (sizeK).
export function pieceStyle(o, extra = {}) {
  const p = o.piece;
  const v = p.b * p.sizeK;
  const k = extra.zoom || 1;
  const R = (14 + 56 * v) * k;
  return {
    R, L: R * 2.2, cone: p.cone, neck: p.neck, flat: p.flat, open: p.open,
    heat: p.heat, lipHeat: p.lipHeat, fritRgb: p.fritRgb, coverage: p.coverage,
    off: p.off, phase: p.phase, ...extra,
  };
}

/**
 * Who this station should act on right now.
 * Returns { o, step } when the piece in hand needs this station, otherwise draws a hint and returns null.
 */
export function workingOrder(game, station, g) {
  const o = game.handOrder;
  if (!o) {
    if (g) banner(g, hintEmptyHands(game, station));
    return null;
  }
  const step = stepOf(o);
  if (!step || step.station !== station) {
    if (g) banner(g, `${o.customer.name}’s piece needs the ${cap(step?.station)} next →`, PAL.amber);
    return null;
  }
  return { o, step };
}

function hintEmptyHands(game, station) {
  if (station === 'furnace') return 'Grab a pipe for a ticket, warm it, then take it from the warmer.';
  const g = game.garage.findIndex((id) => id != null);
  if (g >= 0) return 'Hands are empty. Click a garage slot to pick a piece back up.';
  return 'Hands are empty. Start a piece at the Furnace.';
}

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export function stationOfNext(o) {
  return STEPS[o.step]?.station;
}

export function drawTicket(g, x, y, o, { w = 210 } = {}) {
  const t = o.ticket;
  const f = fritById(t.frit);
  box(g, x, y, w, 150, PAL.paper, 6);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let yy = y + 30; yy < y + 150; yy += 22) g.fillRect(x + 8, yy, w - 16, 1);
  text(g, `#${o.id}  ${o.customer.name}`, x + 12, y + 24, { size: 18 });
  text(g, `M Tumbler · straight lip`, x + 12, y + 52, { size: 15, weight: 600 });
  g.fillStyle = rgbStr(f.rgb);
  g.beginPath(); g.arc(x + 22, y + 75, 9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = PAL.soot; g.lineWidth = 2; g.stroke();
  text(g, `${f.name} frit`, x + 38, y + 81, { size: 15, weight: 600 });
  text(g, `Density: ${DENSITY_LABEL[t.doses]} (${t.doses} dose${t.doses > 1 ? 's' : ''})`, x + 12, y + 108, { size: 15, weight: 600 });
  text(g, `$${t.price}`, x + w - 12, y + 138, { size: 16, align: 'right' });
}

export function stationIndex(name) { return STATIONS.indexOf(name); }

export function hit(b, x, y) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
