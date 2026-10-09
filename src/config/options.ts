import type { Context } from "@opencode/plugin/tui/context"
import { DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS } from "./constants"

export function intervalMs(ctx: Context): number {
  const raw = ctx.options.intervalMs
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_INTERVAL_MS
  return Math.max(MIN_INTERVAL_MS, Math.floor(raw))
}

const TREE_STYLES = ["none", "comfortable", "compact", "minimal"] as const

export type TreeStyle = (typeof TREE_STYLES)[number]

export function folderTree(ctx: Context): TreeStyle {
  const raw = ctx.options.folderTree
  return (TREE_STYLES as readonly unknown[]).includes(raw) ? (raw as TreeStyle) : "none"
}
