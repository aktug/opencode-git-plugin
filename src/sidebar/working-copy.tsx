import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { EVENT_REFRESH_DEBOUNCE_MS, REFRESH_STORE_KEY, intervalMs } from "../config"
import { fetchWorkingCopyFallback, type GitRunner } from "../git"
import { friendlyError } from "../ui"
import type { ChangeFile } from "../types"

export type WorkingCopy = ReturnType<typeof createWorkingCopy>

type Snapshot = { files: ChangeFile[]; branch: string; hasHead: boolean }

const EMPTY_VCS: Snapshot = { files: [], branch: "", hasHead: true }

export function createWorkingCopy(
  ctx: Context,
  location: () => { directory: string },
  git: GitRunner,
  onRefreshed: (count: number) => void,
) {
  const [files, setFiles] = createSignal<ChangeFile[]>([])
  const [branch, setBranch] = createSignal<string>("")
  const [hasHead, setHasHead] = createSignal<boolean>(true)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | undefined>(undefined)

  let isRefreshing = false
  let lastEventRefreshAt = 0

  const applyFiles = (next: ChangeFile[]) => {
    const prevByFile = new Map(files().map((f) => [f.file, f]))
    setFiles(
      next.map((d) => {
        const p = prevByFile.get(d.file)
        return p && p.additions === d.additions && p.deletions === d.deletions && p.status === d.status
          ? p
          : { ...d }
      }),
    )
  }

  const loadFromVcs = async (loc: { directory: string }): Promise<Snapshot> => {
    try {
      const [statusRes, infoRes] = await Promise.all([
        ctx.client.vcs.status({ location: loc }),
        ctx.client.vcs.get({ location: loc }),
      ])
      return { files: statusRes.data, branch: infoRes.data.branch.current ?? "", hasHead: true }
    } catch {
      return EMPTY_VCS
    }
  }

  const isEmpty = (s: Snapshot) => s.files.length === 0 && s.branch === ""

  const refresh = async () => {
    if (isRefreshing) return
    isRefreshing = true
    try {
      const vcs = await loadFromVcs(location())
      const next = isEmpty(vcs) ? await git.enqueue(() => fetchWorkingCopyFallback(git)) : vcs
      applyFiles(next.files)
      setBranch(next.branch)
      setHasHead(next.hasHead)
      onRefreshed(next.files.length)
      setError(undefined)
    } catch (e) {
      applyFiles([])
      setBranch("")
      setError(friendlyError(e))
    } finally {
      setLoading(false)
      isRefreshing = false
    }
  }

  const additions = createMemo(() => files().reduce((n, f) => n + f.additions, 0))
  const deletions = createMemo(() => files().reduce((n, f) => n + f.deletions, 0))

  const [refreshSignal, bumpRefresh] = ctx.storage.memory(REFRESH_STORE_KEY, { initial: { nonce: 0 } })
  const requestRefresh = () =>
    bumpRefresh((draft) => {
      draft.nonce += 1
    })

  createEffect((prev: number | undefined) => {
    const nonce = refreshSignal.nonce
    if (prev !== undefined) void refresh().catch(() => {})
    return nonce
  })

  const timer = setInterval(() => void refresh().catch(() => {}), intervalMs(ctx))
  const stopListening = ctx.data.listen(({ details }: { details: { type: string } }) => {
    const t = details.type
    if (!(t.includes("session") || t.includes("vcs") || t.includes("server.connected") || t.includes("location"))) return
    const now = Date.now()
    if (now - lastEventRefreshAt < EVENT_REFRESH_DEBOUNCE_MS) return
    lastEventRefreshAt = now
    void refresh().catch(() => {})
  })
  onCleanup(() => {
    clearInterval(timer)
    stopListening()
  })

  return { files, branch, hasHead, loading, error, additions, deletions, refresh, requestRefresh }
}
