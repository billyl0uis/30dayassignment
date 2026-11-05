import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The vessel core's boundaries, checked so they can't creep back:
//   model: plain JavaScript only (no three.js, React or browser, and nothing
//     from render, stores or ui, which would bring them in), so the maths
//     runs in tests and in any app
//   stores: no React
//   render: no React
//   all of core: imports only from inside core, by relative path, and never
//     from the jar app (or any app), so the perfume bottle app can reuse it

const CORE = new URL('.', import.meta.url).pathname
const filesIn = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return filesIn(path)
    return /\.jsx?$/.test(name) && !name.endsWith('.test.js') ? [path] : []
  })
const imports = (text) => [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const target = (file, spec) => relative(CORE, join(file, '..', spec))

describe('core boundaries', () => {
  it('model has no three.js, React or browser code', () => {
    const problems = []
    for (const file of filesIn(join(CORE, 'model'))) {
      const text = readFileSync(file, 'utf8')
      const name = relative(CORE, file)
      for (const spec of imports(text)) {
        if (/^(three|react|react-dom)(\/|$)/.test(spec)) problems.push(`${name} imports ${spec}`)
        if (spec.startsWith('.') && /^(render|stores|ui)\//.test(target(file, spec))) problems.push(`${name} imports ${spec}`)
      }
      if (/\b(document|window|localStorage|requestAnimationFrame)\b/.test(code(text))) problems.push(`${name} uses the browser`)
    }
    expect(problems).toEqual([])
  })

  for (const area of ['stores', 'render']) {
    it(`${area} has no React`, () => {
      const problems = filesIn(join(CORE, area)).flatMap((file) =>
        imports(readFileSync(file, 'utf8'))
          .filter((spec) => /^react(-dom)?(\/|$)/.test(spec))
          .map((spec) => `${relative(CORE, file)} imports ${spec}`),
      )
      expect(problems).toEqual([])
    })
  }

  it('core imports only from inside core, by relative path', () => {
    const problems = []
    for (const file of filesIn(CORE)) {
      for (const spec of imports(readFileSync(file, 'utf8'))) {
        const name = relative(CORE, file)
        if (spec.startsWith('@')) problems.push(`${name} uses an alias for ${spec}`)
        if (spec.startsWith('.') && target(file, spec).startsWith('..')) problems.push(`${name} reaches outside core: ${spec}`)
      }
    }
    expect(problems).toEqual([])
  })
})
