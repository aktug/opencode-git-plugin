import type { Context } from "@opencode/plugin/tui/context"
import { DIFF_STORE_KEY } from "../config"
import type { DiffViewState } from "../types"

export const initialDiffState: DiffViewState = {
  file: "",
  additions: 0,
  deletions: 0,
  lines: [],
  patch: "",
  message: "",
  truncated: false,
  loading: false,
  query: "",
  matchCursor: 0,
  panelOpen: false,
}

export function useDiffStore(ctx: Context) {
  return ctx.storage.memory(DIFF_STORE_KEY, { initial: initialDiffState })
}

let diffClosedHandler: (() => void) | undefined

export function setDiffClosedHandler(handler: (() => void) | undefined): void {
  diffClosedHandler = handler
}

export function notifyDiffClosed(): void {
  try {
    diffClosedHandler?.()
  } catch {
  }
}
