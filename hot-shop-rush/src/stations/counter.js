import { W, PAL, backdrop, box, text, customer, button, banner } from '../draw.js';
import { drawTicket } from './common.js';

export const counter = {
  buttons: [],

  draw(g, game, t) {
    this.buttons = [];
    backdrop(g);
    const d = game.cfg.day;

    // Shop window + sign.
    box(g, 40, 70, 300, 180, '#A9C4E0', 8);
    g.strokeStyle = PAL.soot; g.lineWidth = 3;
    g.beginPath(); g.moveTo(190, 70); g.lineTo(190, 250); g.moveTo(40, 160); g.lineTo(340, 160); g.stroke();
    box(g, 370, 30, 220, 50, PAL.wood, 10);
    text(g, `Day ${game.day} · Hot Shop`, 480, 63, { size: 20, align: 'center', color: PAL.paper });

    // Lobby (waiting customers beyond the first).
    game.lobby.slice(1).forEach((c, i) => {
      const x = 720 + i * 120, y = 250;
      customer(g, x, y, c.customer.look, { scale: 0.7, bob: t * 2 + i });
      ring(g, x, y - 80, 1 - c.waited / d.LOBBY_PATIENCE_S);
    });

    // Front customer.
    const front = game.lobby[0];
    if (front) {
      const mood = front.waited > d.LOBBY_PATIENCE_S * 0.6 ? 'sad' : 'neutral';
      customer(g, 480, 260, front.customer.look, { scale: 1.1, mood, bob: t * 2 });
      ring(g, 560, 160, 1 - front.waited / d.LOBBY_PATIENCE_S);
      box(g, 560, 180, 320, 60, PAL.paper, 14);
      text(g, front.customer.line, 572, 204, { size: 14, weight: 600 });
      text(g, `— ${front.customer.name}`, 572, 226, { size: 14 });
    }

    // Counter.
    box(g, 120, 380, 720, 70, PAL.wood, 8);
    g.fillStyle = PAL.sawdust; g.fillRect(124, 384, 712, 10);

    // Ticket printer + latest ticket.
    const sel = game.order(game.selected);
    if (sel) {
      text(g, 'Selected ticket', 60, 476, { size: 15, color: PAL.paper });
      drawTicket(g, 60, 484, sel, { w: 230 });
    }

    if (front) {
      const full = game.activeOrders.length >= d.RAIL_MAX;
      this.buttons.push({ x: 400, y: 470, w: 160, h: 52, label: full ? 'Rail full' : 'Take order', color: PAL.green, textColor: '#fff', enabled: !full && game.phase === 'open', onClick: () => game.takeOrder() });
    } else if (game.phase === 'open') {
      banner(g, game.pastLastCall ? 'Last call has passed. Finish what’s on the rail.' : 'No one at the counter. Get some glass going!');
    }

    if (game.canCloseEarly) {
      this.buttons.push({ x: 640, y: 470, w: 190, h: 52, label: 'Close up early', color: PAL.amber, onClick: () => game.closeDay() });
    }
    for (const b of this.buttons) button(g, b);
  },
};

function ring(g, x, y, frac) {
  const f = Math.max(0, Math.min(1, frac));
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = f > 0.5 ? PAL.green : f > 0.25 ? PAL.amber : PAL.red;
  g.beginPath(); g.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke();
}
