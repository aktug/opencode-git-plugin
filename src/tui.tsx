/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { generateSyntax } from "@opencode/theme/tui"
import { Plugin } from "@opencode/plugin/tui"
import type { Context, KeymapCommand, PanelInput } from "@opencode/plugin/tui/context"
import {
  DIFF_PANEL_NAME,
  DIFF_STORE_KEY,
  DEFAULT_INTERVAL_MS,
  EVENT_REFRESH_DEBOUNCE_MS,
  LIST_NAV_MODE,
  MAX_DIFF_LINES,
  MIN_INTERVAL_MS,
  REFRESH_STORE_KEY,
  SETTINGS_STORE_KEY,
  STAGED_STORE_KEY,
} from "./config"
import { createGitRunner, parseDiff, parseStagedPorcelain, shellQuote } from "./git"
import { diffLinePrefix, diffLineStyle, filePathMaxWidth, friendlyError, maxTextWidth, statusBadge, truncatePath } from "./ui"
import { syntaxFiletype } from "./ui"
import type {
  ChangeFile,
  DiffRow,
  DiffViewState,
  FileBinds,
  LayoutResizeEmitter,
  RendererFocusEvents,
  RenderNode,
  ScrollHandle,
} from "./types"

export { parseDiff, parseStagedPorcelain }

let sidebarFocusNode: RenderNode | undefined
let notifyDiffClosed: (() => void) | undefined

const initialDiffState: DiffViewState = {
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

function intervalMs(ctx: Context): number {
  const raw = ctx.options.intervalMs
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_INTERVAL_MS
  return Math.max(MIN_INTERVAL_MS, Math.floor(raw))
}

function GitChangesView(props: { ctx: Context }) {
  const { ctx } = props
  const [files, setFiles] = createSignal<ChangeFile[]>([])
  const [branch, setBranch] = createSignal<string>("")
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [selected, setSelected] = createSignal(0)
  const [navMode, setNavMode] = createSignal(false)
  const [sidebarWidth, setSidebarWidth] = createSignal(46)
  const [stagedMem, setStagedMem] = ctx.storage.memory(STAGED_STORE_KEY, {
    initial: { directory: "", files: [] as string[] },
  })
  const staged = createMemo(() => new Set(stagedMem.files))
  const [stageMode, setStageMode] = createSignal(false)
  const [diffView] = ctx.storage.memory(DIFF_STORE_KEY, { initial: initialDiffState })

  let isRefreshing = false
  let lastEventRefreshAt = 0
  let stagedRefreshTask: Promise<void> | undefined
  let activeDiffRequestId = 0

  const currentLocation = () => {
    const loc = ctx.location ?? ctx.data.location.default()
    return { directory: loc.directory }
  }
  if (stagedMem.directory !== currentLocation().directory) {
    setStagedMem((draft) => {
      draft.directory = currentLocation().directory
      draft.files = []
    })
  }

  const git = createGitRunner(ctx, () => currentLocation().directory)

  const fetchStagedStatuses = async () => {
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

  const scheduleStagedRefresh = async () => {
    if (stagedRefreshTask) return stagedRefreshTask
    stagedRefreshTask = git.enqueue(fetchStagedStatuses).finally(() => {
      stagedRefreshTask = undefined
    })
    return stagedRefreshTask
  }

  const refreshWorkingCopy = async () => {
    if (isRefreshing) return
    isRefreshing = true
    try {
      const loc = currentLocation()
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
      setSelected((prev) => Math.min(prev, Math.max(0, statusRes.data.length - 1)))
      void scheduleStagedRefresh()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
      isRefreshing = false
    }
  }

  const openDiff = async (f: ChangeFile) => {
    const requestId = ++activeDiffRequestId
    const [, setDiffState] = ctx.storage.memory(DIFF_STORE_KEY, { initial: initialDiffState })
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
      const res = await ctx.client.vcs.diff({ location: currentLocation(), mode: "working", context: 3 })
      if (requestId !== activeDiffRequestId || diffView.file !== f.file || !diffView.panelOpen) return
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
      if (requestId !== activeDiffRequestId || diffView.file !== f.file || !diffView.panelOpen) return
      setDiffState((draft) => {
        draft.loading = false
        draft.message = friendlyError(e)
      })
    }
  }

  let popListNavMode: (() => void) | null = null

  const pushListNavMode = () => {
    popListNavMode = ctx.keymap.mode.push(LIST_NAV_MODE)
  }

  const enterListNavigation = () => {
    if (popListNavMode) {
      try {
        if (ctx.keymap.mode.current() === LIST_NAV_MODE) return
      } catch {
        return
      }
      popListNavMode = null
    }
    pushListNavMode()
    setNavMode(true)
  }
  const exitListNavigation = () => {
    try {
      if (ctx.keymap.mode.current() === LIST_NAV_MODE) popListNavMode?.()
    } catch {
    }
    popListNavMode = null
    setNavMode(false)
    setStageMode(false)
  }
  const ensureListNavigation = () => {
    if (!navMode()) return
    try {
      if (ctx.keymap.mode.current() !== LIST_NAV_MODE) {
        popListNavMode = null
        pushListNavMode()
      }
    } catch {
    }
  }

  const selectNextFile = () => {
    const count = files().length
    if (count > 0) setSelected((prev) => (prev + 1) % count)
  }
  const selectPreviousFile = () => {
    const count = files().length
    if (count > 0) setSelected((prev) => (prev - 1 + count) % count)
  }
  const openSelectedDiff = () => {
    const list = files()
    const f = list[Math.min(selected(), list.length - 1)]
    if (f) void openDiff(f).catch(() => {})
  }

  const applyStageChange = (file: string, stage: boolean) => {
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
          await fetchStagedStatuses()
          return
        }
        await fetchStagedStatuses()
      } catch (e) {
        ctx.ui.toast.show({ message: `git failed: ${friendlyError(e)}`, variant: "error" })
        await fetchStagedStatuses()
        return
      }
    })
  }

  const toggleStageFile = (file: string) => {
    applyStageChange(file, !staged().has(file))
  }

  const toggleStageMode = () => {
    if (files().length === 0) return
    const next = !stageMode()
    setStageMode(next)
    if (next) {
      enterListNavigation()
    }
  }

  const setSelectedFileStaged = async (stage: boolean) => {
    const list = files()
    const f = list[Math.min(selected(), list.length - 1)]
    if (!f) return
    applyStageChange(f.file, stage)
  }

  const commitStaged = async () => {
    await scheduleStagedRefresh()
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

  const totalAdditions = createMemo(() => files().reduce((n, f) => n + f.additions, 0))
  const totalDeletions = createMemo(() => files().reduce((n, f) => n + f.deletions, 0))

  void refreshWorkingCopy().catch(() => {})
  void scheduleStagedRefresh().catch(() => {})
  const [refreshSignal, bumpRefresh] = ctx.storage.memory(REFRESH_STORE_KEY, { initial: { nonce: 0 } })

  const buildFileCommands = (binds: FileBinds, palette: boolean, hasFiles: boolean): KeymapCommand[] => [
    {
      id: "git-panel.next",
      title: "Git Panel: Next File",
      group: "Git Panel",
      bind: binds.next,
      enabled: hasFiles,
      run: () => selectNextFile(),
    },
    {
      id: "git-panel.prev",
      title: "Git Panel: Previous File",
      group: "Git Panel",
      bind: binds.prev,
      enabled: hasFiles,
      run: () => selectPreviousFile(),
    },
    {
      id: "git-panel.open",
      title: "Git Panel: Open Diff",
      group: "Git Panel",
      bind: binds.open,
      palette: palette ? true : undefined,
      enabled: hasFiles,
      run: () => openSelectedDiff(),
    },
    {
      id: "git-panel.stage",
      title: "Git Panel: Stage File",
      group: "Git Panel",
      bind: binds.stage,
      palette: palette ? true : undefined,
      enabled: hasFiles,
      run: () => {
        void setSelectedFileStaged(true)
      },
    },
    {
      id: "git-panel.unstage",
      title: "Git Panel: Unstage File",
      group: "Git Panel",
      bind: binds.unstage,
      palette: palette ? true : undefined,
      enabled: hasFiles,
      run: () => {
        void setSelectedFileStaged(false)
      },
    },
    {
      id: "git-panel.commit",
      title: "Git Panel: Commit Staged",
      group: "Git Panel",
      bind: binds.commit,
      palette: palette ? true : undefined,
      run: () => {
        void commitStaged()
      },
    },
  ]

  ctx.keymap.layer(() => {
    const count = files().length
    const hasFiles = count > 0
    return {
      mode: "global",
      bindings: ["git-panel.focus-list", "git-panel.next", "git-panel.prev", "git-panel.open", "git-panel.stage", "git-panel.unstage", "git-panel.commit"],
      commands: [
        {
          id: "git-panel.refresh",
          title: "Git Panel: Refresh",
          group: "Git Panel",
          palette: true,
          run: () => bumpRefresh((draft) => {
            draft.nonce += 1
          }),
        },
        {
          id: "git-panel.focus-list",
          title: "Git Panel: Focus List",
          group: "Git Panel",
          bind: "<leader>G",
          palette: true,
          enabled: hasFiles,
          run: () => enterListNavigation(),
        },
        ...buildFileCommands({}, true, hasFiles),
      ],
    }
  })

  ctx.keymap.layer(() => {
    const count = files().length
    const hasFiles = count > 0
    const canExitNav = navMode() && !diffView.panelOpen && !stageMode()
    return {
      mode: LIST_NAV_MODE,
      priority: 10,
      bindings: ["git-panel.next", "git-panel.prev", "git-panel.open", "git-panel.stage", "git-panel.unstage", "git-panel.commit", "git-panel.exit-stage-mode", "git-panel.unfocus-list"],
      commands: [
        ...buildFileCommands(
          { next: "down", prev: "up", open: "return", stage: "right", unstage: "left", commit: "c" },
          false,
          hasFiles,
        ),
        {
          id: "git-panel.exit-stage-mode",
          title: "Git Panel: Exit Stage Mode",
          group: "Git Panel",
          bind: "escape",
          enabled: stageMode(),
          run: () => setStageMode(false),
        },
        {
          id: "git-panel.unfocus-list",
          title: "Git Panel: Exit List Navigation",
          group: "Git Panel",
          bind: "escape",
          enabled: canExitNav,
          run: () => exitListNavigation(),
        },
      ],
    }
  })

  createEffect((prev: number | undefined) => {
    const nonce = refreshSignal.nonce
    if (prev !== undefined) void refreshWorkingCopy().catch(() => {})
    return nonce
  })
  const restoreListFocus = () => {
    if (!navMode() || diffView.panelOpen) return
    ensureListNavigation()
  }
  const handleDiffClosed = () => {
    if (!navMode() && files().length > 0) {
      enterListNavigation()
    }
    restoreListFocus()
  }
  notifyDiffClosed = () => handleDiffClosed()
  createEffect((wasOpen: boolean | undefined) => {
    const open = diffView.panelOpen
    if (wasOpen === true && open === false && navMode()) {
      setTimeout(() => restoreListFocus(), 0)
    }
    return open
  })
  const timer = setInterval(() => void refreshWorkingCopy().catch(() => {}), intervalMs(ctx))
  const stopListening = ctx.data.listen(({ details }: { details: { type: string } }) => {
    const t = details.type
    if (!(t.includes("session") || t.includes("vcs") || t.includes("server.connected") || t.includes("location"))) return
    const now = Date.now()
    if (now - lastEventRefreshAt < EVENT_REFRESH_DEBOUNCE_MS) return
    lastEventRefreshAt = now
    void refreshWorkingCopy().catch(() => {})
  })
  const isInsideSidebar = (node: RenderNode | null | undefined) => {
    let current = node
    while (current) {
      if (current === sidebarFocusNode) return true
      current = current.parent
    }
    return false
  }
  const rendererEvents = ctx.renderer as unknown as RendererFocusEvents
  const handleFocusedRenderable = (current: RenderNode | null) => {
    if (!navMode() || diffView.panelOpen) return
    if (ctx.ui.panel.current()?.name === DIFF_PANEL_NAME) return
    if (!isInsideSidebar(current)) exitListNavigation()
  }
  const handleFocusedEditor = (editor: unknown) => {
    if (editor == null) return
    if (navMode() && !diffView.panelOpen) exitListNavigation()
  }
  rendererEvents.on("focused_renderable", handleFocusedRenderable)
  rendererEvents.on("focused_editor", handleFocusedEditor)
  onCleanup(() => {
    clearInterval(timer)
    stopListening()
    rendererEvents.off("focused_renderable", handleFocusedRenderable)
    rendererEvents.off("focused_editor", handleFocusedEditor)
    if (notifyDiffClosed !== undefined) {
      notifyDiffClosed = undefined
    }
    exitListNavigation()
  })

  const isNavBorderActive = () => navMode()
  const setSidebarRef = (el: RenderNode) => {
    sidebarFocusNode = el
    setSidebarWidth(el.width)
    const onNodeResize = () => setSidebarWidth(el.width)
    ;(el as unknown as LayoutResizeEmitter).on("resize", onNodeResize)
    onCleanup(() => (el as unknown as LayoutResizeEmitter).off("resize", onNodeResize))
  }
  const sidebarBody = (
    <>
      <box flexDirection="column" gap={0}>
        <box flexDirection="row" gap={1}>
          <text fg={ctx.theme.text.base}>
            <b>Git Panel</b>
          </text>
          <box flexGrow={1} />
          <Show when={branch() && files().length > 0}>
            <text fg={ctx.theme.text.muted} onMouseUp={() => toggleStageMode()}>
              ▶ {branch()}{" "}
            </text>
            <text fg={ctx.theme.text.base}>({files().length})</text>
          </Show>
          <Show when={!loading() && !error() && files().length > 0}>
            <text fg={ctx.theme.diff.text.added}>+{totalAdditions()}</text>
            <text fg={ctx.theme.diff.text.removed}>-{totalDeletions()}</text>
          </Show>
        </box>
        <Show when={!loading() && !error() && files().length > 0 && navMode()}>
          <box flexDirection="row" gap={1}>
            <box flexGrow={1} />
            <Show
              when={stageMode()}
              fallback={<text fg={ctx.theme.text.muted}>[← → : stage/unstage]</text>}
            >
              <text fg={ctx.theme.text.feedback.warning.base}>[click : stage/unstage]</text>
            </Show>
            <Show when={staged().size > 0}>
              <text fg={ctx.theme.text.feedback.success.base} onMouseUp={() => void commitStaged()}>
                [c : Commit]
              </text>
            </Show>
          </box>
        </Show>
      </box>

      <Show when={loading()}>
        <text fg={ctx.theme.text.muted}>Loading…</text>
      </Show>
      <Show when={!loading() && error()}>
        <text fg={ctx.theme.text.feedback.error.base}>{error()}</text>
      </Show>
      <Show when={!loading() && !error() && files().length === 0 && !branch()}>
        <text fg={ctx.theme.text.muted}>Empty repo — no commits yet</text>
      </Show>
      <Show when={!loading() && !error() && files().length === 0 && !!branch()}>
        <text fg={ctx.theme.text.muted}>Working tree clean</text>
      </Show>
      <Show when={!loading() && !error() && files().length > 0}>
        <box flexDirection="column" gap={0}>
          <For each={files()}>
            {(f, i) => {
              const b = statusBadge(f.status, ctx.theme)
              const label = () => (staged().has(f.file) ? `[${b.label}]` : ` ${b.label} `)
              return (
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseUp={() => {
                    setSelected(i())
                    if (stageMode()) {
                      toggleStageFile(f.file)
                    } else {
                      void openDiff(f).catch(() => {})
                    }
                  }}
                >
                  <Show when={navMode()}>
                    <text fg={ctx.theme.text.muted} width={1}>
                      {i() === selected() ? "❯" : " "}
                    </text>
                  </Show>
                  <text fg={b.color} width={3}>
                    <b>{label()}</b>
                  </text>
                  <text
                    fg={navMode() && i() === selected() ? ctx.theme.text.base : ctx.theme.text.muted}
                    wrapMode="none"
                  >
                    {truncatePath(f.file, filePathMaxWidth(sidebarWidth()))}
                  </text>
                  <box flexGrow={1} />
                  <text fg={ctx.theme.diff.text.added}>+{f.additions}</text>
                  <text fg={ctx.theme.diff.text.removed}>-{f.deletions}</text>
                </box>
              )
            }}
          </For>
        </box>
      </Show>
    </>
  )

  return (
    <Show
      when={isNavBorderActive()}
      fallback={
        <box flexDirection="column" gap={1} ref={setSidebarRef}>
          {sidebarBody}
        </box>
      }
    >
      <box
        flexDirection="column"
        gap={1}
        border={["top", "bottom"]}
        borderStyle="rounded"
        borderColor={ctx.theme.text.feedback.warning.base}
        focusedBorderColor={ctx.theme.text.feedback.warning.base}
        ref={setSidebarRef}
      >
        {sidebarBody}
      </box>
    </Show>
  )
}

function DiffPanel(props: { ctx: Context; input: PanelInput }) {
  const ctx = props.ctx
  const input = () => props.input
  const theme = ctx.theme
  const [diffState, setDiffState] = ctx.storage.memory(DIFF_STORE_KEY, { initial: initialDiffState })
  const [settings, setSettings] = ctx.storage.store(SETTINGS_STORE_KEY, {
    initial: { syntax: false },
  })
  const toggleSyntax = () => {
    void setSettings((draft) => {
      draft.syntax = !draft.syntax
    }).catch(() => {})
  }
  const isSyntaxViewActive = () =>
    settings.syntax && !diffState.truncated && diffState.query === "" && diffState.patch !== ""
  const syntaxHighlightStyle = createMemo(() => (settings.syntax ? generateSyntax(theme) : undefined))

  const searchMatchIndices = createMemo(() => {
    const q = diffState.query.toLowerCase()
    if (!q) return []
    const out: number[] = []
    diffState.lines.forEach((line, i) => {
      if (line.text.toLowerCase().includes(q)) out.push(i)
    })
    return out
  })
  const currentMatchIndex = createMemo(() => {
    const m = searchMatchIndices()
    if (m.length === 0) return -1
    return m[((diffState.matchCursor % m.length) + m.length) % m.length]
  })

  let previousRows: DiffRow[] = []
  const visibleDiffRows = createMemo(() => {
    const q = diffState.query.toLowerCase()
    const cur = currentMatchIndex()
    const prev = previousRows
    const next = diffState.lines.map((line, idx) => {
      const hit = q !== "" && line.text.toLowerCase().includes(q)
      const state = (idx === cur ? "current" : hit ? "hit" : "plain") as DiffRow["state"]
      const p = prev[idx]
      if (p && p.kind === line.kind && p.text === line.text && p.line === line.line && p.state === state) return p
      return { kind: line.kind, text: line.text, line: line.line, state }
    })
    previousRows = next
    return next
  })

  createEffect(() => {
    if (input().name !== DIFF_PANEL_NAME && diffState.panelOpen) {
      setDiffState((draft) => {
        draft.panelOpen = false
      })
    }
  })

  createEffect(() => {
    if (input().name === DIFF_PANEL_NAME && !input().focused) {
      try {
        input().focus()
      } catch {
      }
    }
  })

  let scrollEl: ScrollHandle | undefined

  const safeScrollTo = (y: number) => {
    const el = scrollEl
    if (!el) return
    try {
      el.scrollTo({ x: 0, y: Math.max(0, y) })
    } catch {
    }
  }

  createEffect(() => {
    const line = currentMatchIndex()
    if (line < 0 || input().name !== DIFF_PANEL_NAME || !scrollEl) return
    const target = Math.max(0, line - 10)
    setTimeout(() => safeScrollTo(target), 50)
  })

  const scrollSyntaxBy = (delta: number) => {
    if (!scrollEl) return
    safeScrollTo(scrollEl.scrollTop + delta)
  }

  const stepSearchMatch = (dir: 1 | -1) => {
    const m = searchMatchIndices()
    if (m.length === 0) return
    setDiffState((draft) => {
      draft.matchCursor = (draft.matchCursor + dir + m.length) % m.length
    })
  }

  const closeDiff = () => {
    setDiffState((draft) => {
      draft.panelOpen = false
    })
    ctx.ui.panel.close()
    try {
      notifyDiffClosed?.()
    } catch {
    }
  }

  const promptSearchQuery = async () => {
    try {
      const q = await ctx.ui.dialog.prompt({
        title: "Search in diff",
        placeholder: "Type to highlight matches",
        value: diffState.query,
      })
      if (q === undefined) return
      setDiffState((draft) => {
        draft.query = q
        draft.matchCursor = 0
      })
    } catch (e) {
      ctx.ui.toast.show({ message: `Search failed: ${friendlyError(e)}`, variant: "error" })
    }
  }

  ctx.keymap.layer(() => {
    const searching = diffState.query.length > 0
    const hasMatches = searchMatchIndices().length > 0
    const inSyntax = isSyntaxViewActive()
    return {
      mode: "global",
      priority: 20,
      enabled: () => input().name === DIFF_PANEL_NAME,
      bindings: [
        "git-panel.diff-search",
        "git-panel.diff-next-match",
        "git-panel.diff-prev-match",
        "git-panel.diff-clear-search",
        "git-panel.close-diff",
        "git-panel.close-diff-backspace",
        "git-panel.toggle-syntax",
        "git-panel.syntax-down",
        "git-panel.syntax-up",
      ],
      commands: [
        {
          id: "git-panel.diff-search",
          title: "Git Panel: Search in Diff",
          group: "Git Panel",
          bind: "?",
          run: () => {
            void promptSearchQuery()
          },
        },
        {
          id: "git-panel.diff-next-match",
          title: "Git Panel: Next Diff Match",
          group: "Git Panel",
          bind: "down",
          enabled: searching && hasMatches,
          run: () => stepSearchMatch(1),
        },
        {
          id: "git-panel.diff-prev-match",
          title: "Git Panel: Previous Diff Match",
          group: "Git Panel",
          bind: "up",
          enabled: searching && hasMatches,
          run: () => stepSearchMatch(-1),
        },
        {
          id: "git-panel.diff-clear-search",
          title: "Git Panel: Clear Diff Search",
          group: "Git Panel",
          bind: "escape",
          enabled: searching,
          run: () => {
            setDiffState((draft) => {
              draft.query = ""
              draft.matchCursor = 0
            })
          },
        },
        {
          id: "git-panel.close-diff",
          title: "Git Panel: Close Diff",
          group: "Git Panel",
          bind: "escape",
          enabled: !searching,
          run: () => {
            closeDiff()
          },
        },
        {
          id: "git-panel.close-diff-backspace",
          title: "Git Panel: Close Diff (Backspace)",
          group: "Git Panel",
          bind: "backspace",
          enabled: !searching,
          run: () => {
            closeDiff()
          },
        },
        {
          id: "git-panel.toggle-syntax",
          title: "Git Panel: Toggle Diff Syntax Highlighting",
          group: "Git Panel",
          bind: "s",
          palette: true,
          run: () => {
            toggleSyntax()
          },
        },
        {
          id: "git-panel.syntax-down",
          title: "Git Panel: Scroll Syntax Diff Down",
          group: "Git Panel",
          bind: "j",
          enabled: inSyntax,
          run: () => scrollSyntaxBy(3),
        },
        {
          id: "git-panel.syntax-up",
          title: "Git Panel: Scroll Syntax Diff Up",
          group: "Git Panel",
          bind: "k",
          enabled: inSyntax,
          run: () => scrollSyntaxBy(-3),
        },
      ],
    }
  })

  return (
    <Show when={input().name === DIFF_PANEL_NAME}>
      <box flexDirection="column" gap={1} width="100%" height="100%">
        <box flexDirection="column" gap={0} flexShrink={0}>
          <box flexDirection="row" width={Math.max(1, input().width)} flexShrink={0}>
            <text fg={theme.text.base} wrapMode="none" flexShrink={0}>
              <b>
                {truncatePath(
                  diffState.file,
                  maxTextWidth(
                    input().width,
                    `+${diffState.additions}`.length + 1 + `-${diffState.deletions}`.length + 1,
                  ),
                )}
              </b>
            </text>
            <box flexGrow={1} />
            <box flexDirection="row" gap={1} flexShrink={0}>
              <text fg={theme.diff.text.added} wrapMode="none" flexShrink={0}>
                +{diffState.additions}
              </text>
              <text fg={theme.diff.text.removed} wrapMode="none" flexShrink={0}>
                -{diffState.deletions}
              </text>
            </box>
          </box>
          <Show when={diffState.query}>
            <text fg={theme.text.feedback.warning.base} wrapMode="none">
              {searchMatchIndices().length > 0 ? `${diffState.matchCursor + 1}/${searchMatchIndices().length}` : "0/0"} · {diffState.query}
            </text>
          </Show>
          <box height={1} flexShrink={0} />
          <box
            flexDirection="row"
            flexWrap="wrap"
            width={Math.max(1, input().width)}
            gap={1}
            flexShrink={0}
          >
            <text fg={theme.text.muted} wrapMode="none" flexShrink={0} onMouseUp={() => void promptSearchQuery()}>
              [? : Search]
            </text>
            <Show when={diffState.query}>
              <text fg={theme.text.muted} wrapMode="none" flexShrink={0}>
                [↑↓ : Jump]
              </text>
            </Show>
            <text
              fg={settings.syntax ? theme.text.feedback.warning.base : theme.text.muted}
              wrapMode="none"
              flexShrink={0}
              onMouseUp={() => toggleSyntax()}
            >
              {settings.syntax ? "[syntax:on]" : "[syntax:off]"}
            </text>
            <text fg={theme.text.base} wrapMode="none" flexShrink={0} onMouseUp={() => closeDiff()}>
              [ Close · ESC/⌫ ]
            </text>
          </box>
          <text fg={theme.text.muted} wrapMode="none">
            {"─".repeat(Math.max(1, input().width))}
          </text>
        </box>
        <Show when={diffState.loading}>
          <text fg={theme.text.muted}>Loading diff…</text>
        </Show>
        <Show when={!diffState.loading && diffState.message}>
          <text fg={theme.text.muted}>{diffState.message}</text>
        </Show>
        <Show when={!diffState.loading && !diffState.message}>
          <scrollbox
            width="100%"
            flexGrow={1}
            flexShrink={1}
            minHeight={0}
            scrollY
            scrollX={false}
            focused={input().focused}
            ref={(el) => {
              scrollEl = el
            }}
            contentOptions={{ flexDirection: "column", gap: 0 }}
            wrapperOptions={{ paddingRight: 1 }}
          >
            <Show when={isSyntaxViewActive()}>
              <diff
                diff={diffState.patch}
                view="unified"
                filetype={syntaxFiletype(diffState.file)}
                syntaxStyle={syntaxHighlightStyle()}
                showLineNumbers
                wrapMode="word"
                fg={theme.text.base}
                addedBg={theme.diff.background.added}
                removedBg={theme.diff.background.removed}
                contextBg={theme.diff.background.context}
                addedSignColor={theme.diff.text.added}
                removedSignColor={theme.diff.text.removed}
                lineNumberFg={theme.text.muted}
              />
            </Show>
            <Show when={!isSyntaxViewActive()}>
              <For each={visibleDiffRows()}>
                {(row, i) => {
                  const style = diffLineStyle(theme, row.kind)
                  const isCurrent = row.state === "current"
                  const gutter = row.line !== undefined ? String(row.line).padStart(4, " ") : "    "
                  const fg = isCurrent
                    ? theme.diff.background.context
                    : row.state === "hit"
                      ? theme.text.feedback.warning.base
                      : style.fg
                  const bg = isCurrent ? theme.text.feedback.warning.base : style.bg
                  return (
                    <box flexDirection="row" width="100%" id={`git-panel-diff-line-${i()}`}>
                      <text fg={isCurrent ? theme.text.feedback.warning.base : theme.text.muted} width={5}>
                        {isCurrent ? `❯${gutter.slice(1)}` : `${gutter} `}
                      </text>
                      <text fg={fg} bg={bg} wrapMode="word" flexGrow={1}>
                        {diffLinePrefix(row.kind)}
                        {row.text}
                      </text>
                    </box>
                  )
                }}
              </For>
            </Show>
            <Show when={diffState.truncated}>
              <text fg={theme.text.muted}>… truncated</text>
            </Show>
          </scrollbox>
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "git-panel.cli",
  setup(ctx) {
    const unregisterSidebar = ctx.ui.slot({
      append: "sidebar.content",
      render: () => <GitChangesView ctx={ctx} />,
    })
    const unregisterPanel = ctx.ui.slot({
      append: "session.panel",
      render: (input) => <DiffPanel ctx={ctx} input={input} />,
    })

    return () => {
      unregisterSidebar()
      unregisterPanel()
    }
  },
})
