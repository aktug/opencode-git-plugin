import { createMemo } from "solid-js"
import type { DiffRow, DiffViewState } from "../types"

export function createDiffSearch(state: DiffViewState) {
  const matchIndices = createMemo(() => {
    const q = state.query.toLowerCase()
    if (!q) return []
    const out: number[] = []
    state.lines.forEach((line, i) => {
      if (line.text.toLowerCase().includes(q)) out.push(i)
    })
    return out
  })

  const currentMatchIndex = createMemo(() => {
    const m = matchIndices()
    if (m.length === 0) return -1
    return m[((state.matchCursor % m.length) + m.length) % m.length]
  })

  let previousRows: DiffRow[] = []
  const visibleRows = createMemo(() => {
    const q = state.query.toLowerCase()
    const cur = currentMatchIndex()
    const prev = previousRows
    const next = state.lines.map((line, idx) => {
      const hit = q !== "" && line.text.toLowerCase().includes(q)
      const rowState = (idx === cur ? "current" : hit ? "hit" : "plain") as DiffRow["state"]
      const p = prev[idx]
      if (p && p.kind === line.kind && p.text === line.text && p.line === line.line && p.state === rowState) return p
      return { kind: line.kind, text: line.text, line: line.line, state: rowState }
    })
    previousRows = next
    return next
  })

  return { matchIndices, currentMatchIndex, visibleRows }
}
