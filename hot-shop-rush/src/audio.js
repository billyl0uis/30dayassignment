// Tiny WebAudio synth so there are no audio files to ship. Starts on first user gesture.
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', gain = 0.15, slide = 0, delay = 0 } = {}) {
  const a = ac();
  if (!a || muted) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { gain = 0.1, freq = 1200, q = 1 } = {}) {
  const a = ac();
  if (!a || muted) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

const SOUNDS = {
  bell: () => { tone(1320, 0.5, { gain: 0.1 }); tone(1760, 0.6, { gain: 0.06, delay: 0.08 }); },
  print: () => noise(0.25, { freq: 3000, gain: 0.05 }),
  ding: () => tone(1046, 0.4, { gain: 0.1 }),
  step: () => { tone(660, 0.12, { gain: 0.08 }); tone(990, 0.18, { gain: 0.07, delay: 0.07 }); },
  crack: () => { noise(0.18, { freq: 4000, gain: 0.2, q: 3 }); tone(2600, 0.25, { gain: 0.08, slide: -1500 }); },
  pop: () => { noise(0.2, { freq: 600, gain: 0.3 }); tone(300, 0.2, { gain: 0.1, slide: -200 }); },
  puff: () => noise(0.35, { freq: 500, gain: 0.08 }),
  sprinkle: () => noise(0.3, { freq: 6000, gain: 0.05, q: 0.5 }),
  clank: () => { tone(420, 0.12, { type: 'square', gain: 0.04 }); tone(630, 0.1, { type: 'square', gain: 0.03, delay: 0.03 }); },
  whoosh: () => noise(0.6, { freq: 300, gain: 0.15, q: 0.6 }),
  hiss: () => noise(0.6, { freq: 5000, gain: 0.06, q: 0.4 }),
  scrape: () => noise(0.25, { freq: 2200, gain: 0.05, q: 2 }),
  tap: () => tone(1800, 0.08, { type: 'triangle', gain: 0.12 }),
  door: () => noise(0.4, { freq: 160, gain: 0.2 }),
  clunk: () => { tone(160, 0.2, { type: 'triangle', gain: 0.15 }); },
  dip: () => noise(0.4, { freq: 250, gain: 0.08 }),
  ting: () => { tone(2637, 0.9, { gain: 0.08 }); tone(3951, 0.6, { gain: 0.03 }); },
  ping: () => { tone(3520, 0.5, { gain: 0.1, slide: 400 }); noise(0.08, { freq: 7000, gain: 0.08 }); },
};

export function play(name) { SOUNDS[name]?.(); }
export function toggleMute() { muted = !muted; return muted; }
