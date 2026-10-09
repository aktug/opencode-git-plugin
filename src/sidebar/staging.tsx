import { createMemo } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { STAGED_STORE_KEY } from "../config"
import { parseStagedPorcelain, shellQuote, type GitRunner } from "../git"
import { friendlyError } from "../ui"

export function shouldStageAll(files: string[], staged: Set<string>): boolean {
  return !files.every((f) => staged.has(f))
}

export type Staging = ReturnType<typeof createStaging>

const HEAD_ERROR_RE =
  /could not resolve HEAD|ambiguous argument ['"]?HEAD|invalid object name ['"]?HEAD/i

export function buildStageArgs(stage: boolean, files: string[]): string {
  const paths = files.map(shellQuote).join(" ")
  return stage ? `add -- ${paths}` : `restore --staged -- ${paths}`
}

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
      if (res.exit !== 0) return
      const files = [...parseStagedPorcelain(res.output)]
      setStagedMem((draft) => {
        draft.files = files
      })
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

  const toastError = (message: string) => ctx.ui.toast.show({ message, variant: "error" })
  const tail = (output: string) => output.trim().slice(0, 200)

  const stageFiles = async (stage: boolean, files: string[]): Promise<void> => {
    const res = await git.run(buildStageArgs(stage, files))
    if (res.exit === 0) return
    if (!stage && HEAD_ERROR_RE.test(res.output)) {
      for (const file of files) {
        const q = shellQuote(file)
        let r = await git.run(`restore --staged -- ${q}`)
        if (r.exit !== 0 && HEAD_ERROR_RE.test(r.output)) r = await git.run(`rm --cached -- ${q}`)
        if (r.exit !== 0) toastError(`git restore failed: ${tail(r.output)}`)
      }
      return
    }
    toastError(`git ${stage ? "add" : "restore"} failed: ${tail(res.output)}`)
  }

  const applyFiles = (files: string[], stage: boolean) => {
    if (files.length === 0) return
    setStagedMem((draft) => {
      const next = new Set(draft.files)
      for (const file of files) {
        if (stage) next.add(file)
        else next.delete(file)
      }
      draft.files = [...next]
    })
    void git.enqueue(async () => {
      try {
        await stageFiles(stage, files)
      } catch (e) {
        toastError(`git failed: ${friendlyError(e)}`)
      } finally {
        await fetchStatuses()
      }
    })
  }

  const applyChange = (file: string, stage: boolean) => applyFiles([file], stage)
  const toggle = (file: string) => applyChange(file, !staged().has(file))
  const toggleAll = (files: string[]) => applyFiles(files, shouldStageAll(files, staged()))

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
          toastError(`git commit failed: ${tail(res.output)}`)
        } else {
          ctx.ui.toast.show({ message: "Committed", variant: "success" })
        }
      } catch (e) {
        toastError(`git commit failed: ${friendlyError(e)}`)
      }
      await refreshWorkingCopy()
    })
  }

  return { staged, scheduleRefresh, applyChange, toggle, toggleAll, commit }
}
