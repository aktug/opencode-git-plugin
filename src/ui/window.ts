/** A fixed-height window over the file/tree rows, with room for "more" markers outside it. */
export function rowWindow(total: number, offset: number, size: number) {
  const start = Math.max(0, Math.min(offset, Math.max(0, total - size)))
  return { start, end: Math.min(total, start + size), above: start, below: Math.max(0, total - start - size) }
}

/** Keep the keyboard-selected file visible without resetting a manually scrolled page. */
export function revealRow(index: number, offset: number, total: number, size: number) {
  const { start, end } = rowWindow(total, offset, size)
  if (index < 0) return start
  if (index < start) return index
  if (index >= end) return index - size + 1
  return start
}
