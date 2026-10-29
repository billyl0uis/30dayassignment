import { useRef, useState } from 'react'
import { downloadText, fileSlug } from '@core/ui/files'
import { readDesign, saveDesign, startingDesign } from '../design'
import { PRESETS } from '../presets'

// The design's name, starting forms, and saving to / opening from a file.
export function FileBar({ design, onRename, onReplace }) {
  const fileRef = useRef(null)
  const [error, setError] = useState(null)

  const replace = (next) => {
    if (!window.confirm(`Replace “${design.name}” with “${next.name}”? Save it first if you want to keep it.`)) return
    setError(null)
    onReplace(next)
  }

  const open = async (file) => {
    if (!file) return
    try {
      replace(readDesign(await file.text()))
    } catch (e) {
      setError(e.message || 'That file couldn’t be opened.')
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
      <input
        value={design.name}
        aria-label="Design name"
        onChange={(e) => onRename(e.target.value)}
        onBlur={(e) => !e.target.value.trim() && onRename('Untitled jar')}
        className="min-w-0 max-w-56 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-ink outline-none hover:border-line focus:border-accent"
      />
      <select
        value=""
        aria-label="Start from a preset"
        onChange={(e) => {
          const key = e.target.value
          if (key) replace(key === 'blank' ? startingDesign() : structuredClone(PRESETS[key]))
        }}
        className="rounded border border-line bg-raise px-2 py-1 text-mute outline-none hover:text-ink focus:border-accent"
      >
        <option value="">Start from…</option>
        {Object.entries(PRESETS).map(([key, p]) => (
          <option key={key} value={key}>
            {p.name}
          </option>
        ))}
        <option value="blank">Plain starting jar</option>
      </select>
      <button
        type="button"
        onClick={() => downloadText(`${fileSlug(design.name)}.finial.json`, saveDesign(design))}
        className="rounded border border-line px-3 py-1 text-mute hover:text-ink"
      >
        Save
      </button>
      <button type="button" onClick={() => fileRef.current?.click()} className="rounded border border-line px-3 py-1 text-mute hover:text-ink">
        Open
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          open(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && (
        <span role="alert" className="text-danger">
          {error}{' '}
          <button type="button" onClick={() => setError(null)} className="underline">
            OK
          </button>
        </span>
      )}
    </div>
  )
}
