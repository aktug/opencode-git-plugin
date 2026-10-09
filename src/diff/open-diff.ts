import type { Context } from "@opencode/plugin/tui/context"
import { DIFF_PANEL_NAME, MAX_DIFF_LINES } from "../config"
import { parseDiff, shellQuote, type GitRunner } from "../git"
import { useDiffStore } from "../state"
import { friendlyError } from "../ui"
import type { ChangeFile } from "../types"

async function gitFallbackPatch(git: GitRunner, file: string): Promise<string | undefined> {
  const q = shellQuote(file)
  return git.enqueue(async () => {
    const cached = await git.run(`diff --cached --no-renames -U3 -- ${q}`)
    const worktree = await git.run(`diff --no-renames -U3 -- ${q}`)
    const combined = [cached.output, worktree.output].filter((s) => s.trim() !== "").join("\n")
    if (combined.trim() !== "") return combined
    const untracked = await git.run(`diff --no-index --no-renames -U3 -- /dev/null ${q}`)
    return untracked.output.trim() !== "" ? untracked.output : undefined
  })
}

async function vcsPatch(ctx: Context, location: { directory: string }, file: string): Promise<string | undefined> {
  try {
    const res = await ctx.client.vcs.diff({ location, mode: "working", context: 3 })
    return res.data.find((d: { file: string }) => d.file === file)?.patch
  } catch {
    return undefined
  }
}

export function createDiffOpener(
  ctx: Context,
  location: () => { directory: string },
  git: GitRunner,
) {
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
      let patch = await vcsPatch(ctx, location(), f.file)
      if (isStale()) return
      if (patch == null) {
        patch = await gitFallbackPatch(git, f.file).catch(() => undefined)
        if (isStale()) return
      }
      const parsed = patch ? parseDiff(patch) : []
      setDiffState((draft) => {
        draft.loading = false
        draft.patch = patch ?? ""
        if (!patch) {
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
