import type { Context } from "@opencode/plugin/tui/context"
import { DIFF_PANEL_NAME, MAX_DIFF_LINES } from "../config"
import { parseDiff } from "../git"
import { useDiffStore } from "../state"
import { friendlyError } from "../ui"
import type { ChangeFile } from "../types"

export function createDiffOpener(ctx: Context, location: () => { directory: string }) {
  const [diffView, setDiffState] = useDiffStore(ctx)
  let activeRequestId = 0

  return async (f: ChangeFile) => {
    const requestId = ++activeRequestId
    const isStale = () => requestId !== activeRequestId || diffView.file !== f.file || !diffView.panelOpen

    setDiffState((draft) => {
      draft.file = f.file
      draft.additions = f.additions
      draft.deletions = f.deletions
      draft.lines = []
      draft.patch = ""
      draft.message = ""
      draft.truncated = false
      draft.loading = true
      draft.query = ""
      draft.matchCursor = 0
      draft.panelOpen = true
    })
    ctx.ui.panel.open(DIFF_PANEL_NAME, { presentation: "panel" })
    try {
      const res = await ctx.client.vcs.diff({ location: location(), mode: "working", context: 3 })
      if (isStale()) return
      const entry = res.data.find((d: { file: string }) => d.file === f.file)
      const parsed = entry ? parseDiff(entry.patch) : []
      setDiffState((draft) => {
        draft.loading = false
        draft.patch = entry?.patch ?? ""
        if (!entry) {
          draft.message = "No diff available"
        } else if (parsed.length === 0) {
          draft.message = "No visible changes (empty or binary file)"
        } else if (parsed.length > MAX_DIFF_LINES) {
          draft.lines = parsed.slice(0, MAX_DIFF_LINES)
          draft.truncated = true
        } else {
          draft.lines = parsed
        }
      })
    } catch (e) {
      if (isStale()) return
      setDiffState((draft) => {
        draft.loading = false
        draft.message = friendlyError(e)
      })
    }
  }
}
