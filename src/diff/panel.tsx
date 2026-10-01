/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, Show } from "solid-js"
import { generateSyntax } from "@opencode/theme/tui"
import type { Context, PanelInput } from "@opencode/plugin/tui/context"
import { DIFF_PANEL_NAME, SETTINGS_STORE_KEY } from "../config"
import { notifyDiffClosed, useDiffStore } from "../state"
import { friendlyError } from "../ui"
import type { ScrollHandle } from "../types"
import { DiffBody } from "./body"
import { DiffHeader } from "./header"
import { registerDiffKeymap } from "./keymap"
import { createDiffSearch } from "./search"

export function DiffPanel(props: { ctx: Context; input: PanelInput }) {
  const ctx = props.ctx
  const input = () => props.input
  const theme = ctx.theme
  const [diffState, setDiffState] = useDiffStore(ctx)
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
  const search = createDiffSearch(diffState)

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
    const line = search.currentMatchIndex()
    if (line < 0 || input().name !== DIFF_PANEL_NAME || !scrollEl) return
    const target = Math.max(0, line - 10)
    setTimeout(() => safeScrollTo(target), 50)
  })

  const scrollSyntaxBy = (delta: number) => {
    if (!scrollEl) return
    safeScrollTo(scrollEl.scrollTop + delta)
  }

  const stepSearchMatch = (dir: 1 | -1) => {
    const m = search.matchIndices()
    if (m.length === 0) return
    setDiffState((draft) => {
      draft.matchCursor = (draft.matchCursor + dir + m.length) % m.length
    })
  }

  const clearSearch = () => {
    setDiffState((draft) => {
      draft.query = ""
      draft.matchCursor = 0
    })
  }

  const closeDiff = () => {
    setDiffState((draft) => {
      draft.panelOpen = false
    })
    ctx.ui.panel.close()
    notifyDiffClosed()
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

  registerDiffKeymap(ctx, {
    input,
    searching: () => diffState.query.length > 0,
    hasMatches: () => search.matchIndices().length > 0,
    syntaxActive: isSyntaxViewActive,
    search: () => void promptSearchQuery(),
    stepMatch: stepSearchMatch,
    clearSearch,
    close: closeDiff,
    toggleSyntax,
    scrollBy: scrollSyntaxBy,
  })

  return (
    <Show when={input().name === DIFF_PANEL_NAME}>
      <box flexDirection="column" gap={1} width="100%" height="100%">
        <DiffHeader
          theme={theme}
          width={input().width}
          file={diffState.file}
          additions={diffState.additions}
          deletions={diffState.deletions}
          query={diffState.query}
          matchCursor={diffState.matchCursor}
          matchCount={search.matchIndices().length}
          syntax={settings.syntax}
          onSearch={() => void promptSearchQuery()}
          onToggleSyntax={toggleSyntax}
          onClose={closeDiff}
        />
        <DiffBody
          theme={theme}
          state={diffState}
          rows={search.visibleRows()}
          focused={input().focused}
          syntaxActive={isSyntaxViewActive()}
          syntaxStyle={syntaxHighlightStyle()}
          onScrollRef={(el) => {
            scrollEl = el
          }}
        />
      </box>
    </Show>
  )
}
