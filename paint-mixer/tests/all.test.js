// Node runner: `node --test tests/`
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { makeCases } from './cases.js';
import { makeStage2Cases } from './cases-stage2.js';
import { makeStage3Cases } from './cases-stage3.js';
import { makeStage4Cases } from './cases-stage4.js';
import { makeStage5Cases } from './cases-stage5.js';

const lib = JSON.parse(readFileSync(new URL('../paint-library.json', import.meta.url), 'utf8'));

for (const c of [...makeCases(lib), ...makeStage2Cases(lib), ...makeStage3Cases(lib), ...makeStage4Cases(lib), ...makeStage5Cases(lib)]) {
  test(`${c.group} › ${c.name}`, (t) => {
    const r = c.run();
    if (r?.detail) t.diagnostic(r.detail);
  });
}
