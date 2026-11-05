// Module Web Worker: runs the solver off the main thread.
// Messages in:  { id, type: 'solve', targetLab, paints, options }
// Messages out: { id, type: 'progress', value } | { id, type: 'result', result } | { id, type: 'error', message }

import { solve } from './solver.js';

self.onmessage = (e) => {
  const { id, type, targetLab, paints, options = {} } = e.data ?? {};
  if (type !== 'solve') return;
  try {
    const result = solve(targetLab, paints, {
      ...options,
      onProgress: (value) => self.postMessage({ id, type: 'progress', value }),
    });
    self.postMessage({ id, type: 'result', result });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message ?? String(err) });
  }
};
