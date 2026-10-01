import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { EVENT_REFRESH_DEBOUNCE_MS, REFRESH_STORE_KEY, intervalMs } from "../config"
import { friendlyError } from "../ui"
import type { ChangeFile } from "../types"

export type WorkingCopy = ReturnType<typeof createWorkingCopy>

export function createWorkingCopy(
  ctx: Context,
  location: () => { directory: string },
  onRefreshed: (count: number) => void,
) {
  const [files, setFiles] = createSignal<ChangeFile[]>([])
  const [branch, setBranch] = createSignal<string>("")
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | undefined>(undefined)

  let isRefreshing = false
  let lastEventRefreshAt = 0

  const refresh = async () => {
    if (isRefreshing) return
    isRefreshing = true
    try {
      const loc = location()
      const [statusRes, infoRes] = await Promise.all([
        ctx.client.vcs.status({ location: loc }),
        ctx.client.vcs.get({ location: loc }),
      ])
      const prevByFile = new Map(files().map((f) => [f.file, f]))
      setFiles(
        statusRes.data.map((d) => {
          const p = prevByFile.get(d.file)
          return p && p.additions === d.additions && p.deletions === d.deletions && p.status === d.status
            ? p
            : { ...d }
        }),
      )
      setBranch(infoRes.data.branch.current ?? "")
      setError(undefined)
      onRefreshed(statusRes.data.length)
    } catch (e) {
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

  return { files, branch, loading, error, additions, deletions, refresh, requestRefresh }
}
