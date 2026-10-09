import type { ChangeFile } from "../types"

export type PorcelainRecord = {
  file: string
  x: string
  y: string
}

export type FileCounts = {
  additions: number
  deletions: number
}

const NO_COUNTS: FileCounts = { additions: 0, deletions: 0 }

export function parsePorcelainRecords(porcelain: string): PorcelainRecord[] {
  const out: PorcelainRecord[] = []
  for (const record of porcelain.split("\0")) {
    if (record.length < 4) continue
    out.push({ x: record[0], y: record[1], file: record.slice(3) })
  }
  return out
}

const isStaged = (r: PorcelainRecord) => r.x !== " " && r.x !== "?"

export function parseStagedPorcelain(porcelain: string): Set<string> {
  return new Set(parsePorcelainRecords(porcelain).filter(isStaged).map((r) => r.file))
}

export function porcelainChangeStatus(x: string, y: string): ChangeFile["status"] {
  if (x === "?" || y === "?") return "added"
  if (x === "D" || y === "D") return "deleted"
  if (x === "A") return "added"
  return "modified"
}

export function parseNumstat(output: string): Map<string, FileCounts> {
  const counts = new Map<string, FileCounts>()
  for (const record of output.split("\0")) {
    if (!record) continue
    const firstTab = record.indexOf("\t")
    if (firstTab < 0) continue
    const secondTab = record.indexOf("\t", firstTab + 1)
    if (secondTab < 0) continue
    const additions = Number(record.slice(0, firstTab))
    const deletions = Number(record.slice(firstTab + 1, secondTab))
    const file = record.slice(secondTab + 1)
    if (!file) continue
    counts.set(file, {
      additions: Number.isFinite(additions) && additions >= 0 ? additions : 0,
      deletions: Number.isFinite(deletions) && deletions >= 0 ? deletions : 0,
    })
  }
  return counts
}

const countsFor = (counts: Map<string, FileCounts>, file: string): FileCounts => counts.get(file) ?? NO_COUNTS

export function buildFallbackFiles(
  porcelain: string,
  cachedNumstat: string,
  worktreeNumstat: string,
): ChangeFile[] {
  const cached = parseNumstat(cachedNumstat)
  const worktree = parseNumstat(worktreeNumstat)
  return parsePorcelainRecords(porcelain)
    .map((r): ChangeFile => {
      const c = isStaged(r) ? countsFor(cached, r.file) : NO_COUNTS
      const w = countsFor(worktree, r.file)
      return {
        file: r.file,
        status: porcelainChangeStatus(r.x, r.y),
        additions: c.additions + w.additions,
        deletions: c.deletions + w.deletions,
      }
    })
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}
