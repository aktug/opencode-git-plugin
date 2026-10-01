import type { Context } from "@opencode/plugin/tui/context"
import type { ChangeFile, DiffLineKind } from "../types"
import { FILE_ROW_BADGE_WIDTH } from "../config"

type Theme = Context["theme"]
type ThemeColor = Theme["text"]["base"]

const ELLIPSIS = "..."
const runtime = globalThis as { Bun?: { stringWidth?: (text: string) => number } }
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

export function displayWidth(text: string): number {
  return runtime.Bun?.stringWidth?.(text) ?? [...text].length
}

export function truncatePath(path: string, max: number): string {
  if (displayWidth(path) <= max) return path
  const budget = max - ELLIPSIS.length
  if (budget <= 0) return ELLIPSIS.slice(0, Math.max(0, max))
  const parts = Array.from(graphemes.segment(path), (s) => s.segment)
  let width = 0
  let start = parts.length
  for (let i = parts.length - 1; i >= 0; i--) {
    const w = displayWidth(parts[i])
    if (width + w > budget) break
    width += w
    start = i
  }
  return ELLIPSIS + parts.slice(start).join("")
}

export function maxTextWidth(available: number, reserved: number): number {
  return Math.max(8, available - reserved)
}

export function filePathMaxWidth(rowWidth: number, row: { additions: number; deletions: number }): number {
  const gaps = 4
  const fixed = FILE_ROW_BADGE_WIDTH + displayWidth(`+${row.additions}`) + displayWidth(`-${row.deletions}`)
  return maxTextWidth(rowWidth, fixed + gaps)
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/not a git repository|not a repository|no git|vcs|worktree/i.test(msg)) return "Not a git repository"
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg
}

export function statusBadge(status: ChangeFile["status"], theme: Theme): { label: string; color: ThemeColor } {
  if (status === "added") return { label: "A", color: theme.text.feedback.success.base }
  if (status === "deleted") return { label: "D", color: theme.text.feedback.error.base }
  return { label: "M", color: theme.text.feedback.warning.base }
}

export function diffLineStyle(theme: Theme, kind: DiffLineKind): { fg: ThemeColor; bg: ThemeColor | undefined } {
  if (kind === "hunk") return { fg: theme.diff.text.hunkHeader, bg: undefined }
  if (kind === "add") return { fg: theme.diff.text.added, bg: theme.diff.background.added }
  if (kind === "del") return { fg: theme.diff.text.removed, bg: theme.diff.background.removed }
  if (kind === "meta") return { fg: theme.text.muted, bg: undefined }
  return { fg: theme.diff.text.context, bg: theme.diff.background.context }
}

export function diffLinePrefix(kind: DiffLineKind): string {
  if (kind === "add") return "+"
  if (kind === "del") return "-"
  if (kind === "context") return " "
  return ""
}
