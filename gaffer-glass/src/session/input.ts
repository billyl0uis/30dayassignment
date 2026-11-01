import { COLORS } from '../config';
import type { HoldAction, TapAction } from '../sim/actions';
import type { ColorId } from '../sim/piece';
import type { Session } from './session';

export const HOLD_KEYS: Record<HoldAction, { code: string; key: string; label: string }> = {
  gather: { code: 'KeyF', key: 'F', label: 'Gather' },
  glory: { code: 'KeyG', key: 'G', label: 'Glory hole' },
  marver: { code: 'KeyM', key: 'M', label: 'Marver' },
  block: { code: 'KeyK', key: 'K', label: 'Block' },
  blow: { code: 'KeyB', key: 'B', label: 'Blow' },
  jacks: { code: 'KeyJ', key: 'J', label: 'Jacks' },
};

export const TAP_KEYS: Record<TapAction, { code: string; key: string; label: string }> = {
  color: { code: 'KeyC', key: 'C', label: 'Roll in color' },
  transfer: { code: 'KeyP', key: 'P', label: 'Transfer to punty' },
  knockOff: { code: 'KeyX', key: 'X', label: 'Knock off' },
  newPipe: { code: 'KeyN', key: 'N', label: 'New pipe' },
  dump: { code: 'KeyQ', key: 'Q', label: 'Dump in cullet' },
};

export const COLOR_ORDER = Object.keys(COLORS) as ColorId[];

/** Keyboard: hold keys press while down, tap keys fire once, Space starts/stops rotation, ↑/↓ tip the pipe, 1–5 pick a color jar. Returns an unbind. */
export function bindKeyboard(session: Session): () => void {
  const holdByCode = new Map(Object.entries(HOLD_KEYS).map(([a, k]) => [k.code, a as HoldAction]));
  const tapByCode = new Map(Object.entries(TAP_KEYS).map(([a, k]) => [k.code, a as TapAction]));

  const down = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const hold = holdByCode.get(e.code);
    const tap = tapByCode.get(e.code);
    const digit = /^Digit([1-9])$/.exec(e.code);
    const space = e.code === 'Space';
    // Arrow keys tip the pipe: Up raises the tip, Down lowers it, for as long as you hold them.
    const tip = e.code === 'ArrowUp' ? -1 : e.code === 'ArrowDown' ? 1 : 0;
    if (tip) {
      e.preventDefault();
      session.tiltTarget = tip;
      return;
    }
    if (hold || tap || digit || space) e.preventDefault(); // keeps Space from scrolling the page
    if (e.repeat) return;
    if (space) session.toggleRotation();
    else if (hold) session.press(hold);
    else if (tap) session.tap(tap);
    else if (digit) {
      const c = COLOR_ORDER[Number(digit[1]) - 1];
      if (c) session.selectColor(c);
    }
  };
  const up = (e: KeyboardEvent) => {
    if ((e.code === 'ArrowUp' && session.tiltTarget < 0) || (e.code === 'ArrowDown' && session.tiltTarget > 0)) session.tiltTarget = 0;
    const hold = holdByCode.get(e.code);
    if (hold) session.release(hold);
  };
  const blur = () => {
    if (session.held) session.release(session.held);
    session.tiltTarget = 0;
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}

/** Press-and-hold for an on-screen button: down starts, up/cancel/leave stops. */
export function bindHoldButton(el: HTMLElement, onDown: () => void, onUp: () => void) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onDown();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, onUp);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
