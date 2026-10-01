import type { Context } from "@opencode/plugin/tui/context"
import type { ChangeFile, DiffLineKind } from "../types"
import { FILE_ROW_FIXED_WIDTH } from "../config"

type Theme = Context["theme"]
type ThemeColor = Theme["text"]["base"]

export function truncatePath(path: string, max = 38): string {
  if (path.length <= max) return path
  return `...${path.slice(path.length - (max - 3))}`
}

export function maxTextWidth(available: number, reserved: number): number {
  return Math.max(8, available - reserved)
}

export function filePathMaxWidth(sidebarWidth: number): number {
  return maxTextWidth(sidebarWidth, FILE_ROW_FIXED_WIDTH)
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
