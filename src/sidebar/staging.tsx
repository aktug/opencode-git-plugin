import { createMemo } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { STAGED_STORE_KEY } from "../config"
import { parseStagedPorcelain, shellQuote, type GitRunner } from "../git"
import { friendlyError } from "../ui"

export type Staging = ReturnType<typeof createStaging>

export function createStaging(
  ctx: Context,
  git: GitRunner,
  location: () => { directory: string },
  refreshWorkingCopy: () => Promise<void>,
) {
  const [stagedMem, setStagedMem] = ctx.storage.memory(STAGED_STORE_KEY, {
    initial: { directory: "", files: [] as string[] },
  })
  const staged = createMemo(() => new Set(stagedMem.files))

  if (stagedMem.directory !== location().directory) {
    setStagedMem((draft) => {
      draft.directory = location().directory
      draft.files = []
    })
  }

  let refreshTask: Promise<void> | undefined

  const fetchStatuses = async () => {
    try {
      const res = await git.run("status --porcelain=v1 -z -uall --no-renames")
      if (res.exit === 0) {
        const files = [...parseStagedPorcelain(res.output)]
        setStagedMem((draft) => {
          draft.files = files
        })
      }
    } catch {
    }
  }

  const scheduleRefresh = async () => {
    if (refreshTask) return refreshTask
    refreshTask = git.enqueue(fetchStatuses).finally(() => {
      refreshTask = undefined
    })
    return refreshTask
  }

  const applyChange = (file: string, stage: boolean) => {
    setStagedMem((draft) => {
      const next = new Set(draft.files)
      if (stage) next.add(file)
      else next.delete(file)
      draft.files = [...next]
    })
    void git.enqueue(async () => {
      try {
        let res = await git.run(stage ? `add -- ${shellQuote(file)}` : `restore --staged -- ${shellQuote(file)}`)
        if (!stage && res.exit !== 0 && /could not resolve HEAD|ambiguous argument ['"]?HEAD|invalid object name ['"]?HEAD/i.test(res.output)) {
          res = await git.run(`rm --cached -- ${shellQuote(file)}`)
        }
        if (res.exit !== 0) {
          ctx.ui.toast.show({
            message: `git ${stage ? "add" : "restore"} failed: ${res.output.trim().slice(0, 200)}`,
            variant: "error",
          })
          await fetchStatuses()
          return
        }
        await fetchStatuses()
      } catch (e) {
        ctx.ui.toast.show({ message: `git failed: ${friendlyError(e)}`, variant: "error" })
        await fetchStatuses()
        return
      }
    })
  }

  const toggle = (file: string) => {
    applyChange(file, !staged().has(file))
  }

  const commit = async () => {
    await scheduleRefresh()
    if (staged().size === 0) {
      ctx.ui.toast.show({ message: "Nothing staged — stage files with → first", variant: "warning" })
      return
    }
    const message = await ctx.ui.dialog.prompt({ title: "Commit message", placeholder: "Describe the change" })
    if (!message) return
    await git.enqueue(async () => {
      try {
        const res = await git.run(`commit -m ${shellQuote(message)}`)
        if (res.exit !== 0) {
          ctx.ui.toast.show({ message: `git commit failed: ${res.output.trim().slice(0, 200)}`, variant: "error" })
        } else {
          ctx.ui.toast.show({ message: "Committed", variant: "success" })
        }
      } catch (e) {
        ctx.ui.toast.show({ message: `git commit failed: ${friendlyError(e)}`, variant: "error" })
      }
      await refreshWorkingCopy()
    })
  }

  return { staged, scheduleRefresh, applyChange, toggle, commit }
}
