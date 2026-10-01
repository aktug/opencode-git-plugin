import type { Context } from "@opencode/plugin/tui/context"
import { DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS } from "./constants"

export function intervalMs(ctx: Context): number {
  const raw = ctx.options.intervalMs
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_INTERVAL_MS
  return Math.max(MIN_INTERVAL_MS, Math.floor(raw))
}
