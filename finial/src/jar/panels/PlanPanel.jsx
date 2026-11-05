import { Panel } from './Panel'

// The process plan: a starting template with this jar's numbers, every
// step editable. Until you change something it follows the design; after,
// it's yours, and Rebuild brings back a fresh template.
let nextId = 1

export function PlanPanel({ steps, edited, onChange, onRebuild }) {
  const update = (index, patch) => onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  const move = (index, by) => {
    const next = [...steps]
    const [step] = next.splice(index, 1)
    next.splice(index + by, 0, step)
    onChange(next)
  }
  const remove = (index) => onChange(steps.filter((_, i) => i !== index))
  const add = () => onChange([...steps, { id: `own-${nextId++}`, title: 'New step', detail: '' }])

  return (
    <Panel title="Process plan">
      <p className="rounded border border-caution/50 bg-raise p-2 text-xs text-mute">
        A starting template for you to edit, not a technique guide. Rewrite, reorder or delete any step to match how you work.
      </p>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-faint">{edited ? 'Edited: sizes no longer follow the design.' : 'Follows the design as it changes.'}</span>
        {edited && (
          <button
            type="button"
            onClick={() => window.confirm('Replace your edited plan with a fresh template from the design?') && onRebuild()}
            className="shrink-0 underline hover:text-ink"
          >
            Rebuild
          </button>
        )}
      </div>
      <ol className="grid gap-3">
        {steps.map((step, i) => (
          <li key={step.id} className="grid gap-1 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 font-mono text-xs text-faint">{i + 1}</span>
              <input
                value={step.title}
                aria-label={`Step ${i + 1} title`}
                onChange={(e) => update(i, { title: e.target.value })}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-semibold text-ink outline-none hover:border-line focus:border-accent"
              />
              <span className="flex shrink-0 text-faint">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`} className="px-1 hover:text-ink disabled:opacity-30">
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === steps.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move step ${i + 1} down`}
                  className="px-1 hover:text-ink disabled:opacity-30"
                >
                  ↓
                </button>
                <button type="button" onClick={() => remove(i)} aria-label={`Delete step ${i + 1}`} className="px-1 hover:text-danger">
                  ×
                </button>
              </span>
            </div>
            <textarea
              value={step.detail}
              aria-label={`Step ${i + 1} detail`}
              rows={Math.max(2, Math.ceil(step.detail.length / 38))}
              onChange={(e) => update(i, { detail: e.target.value })}
              className="ml-7 resize-y rounded border border-line bg-raise px-2 py-1 text-sm text-mute outline-none focus:border-accent focus:text-ink"
            />
          </li>
        ))}
      </ol>
      <button type="button" onClick={add} className="justify-self-start rounded border border-line px-3 py-1 text-sm text-mute hover:text-ink">
        + Add a step
      </button>
    </Panel>
  )
}
