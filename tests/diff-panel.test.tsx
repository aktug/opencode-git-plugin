/** @jsxImportSource @opentui/solid */
import { describe, expect, mock, test } from "bun:test"
import type { Context, KeymapLayer, PanelInput } from "@opencode/plugin/tui/context"
import { type BoxRenderable, type KeyEvent, RGBA, type TextareaRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal, onCleanup, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { DIFF_PANEL_NAME } from "../src/config"
import { DiffPanel } from "../src/diff/panel"
import { initialDiffState } from "../src/state/diff-store"

async function createPanelFixture(query = "") {
  const [state, setState] = createStore({
    ...initialDiffState,
    file: "first.ts",
    panelOpen: true,
    query,
    lines: [{ kind: "context" as const, text: "a needle in the diff", line: 1 }],
  })
  const [settings, setSettings] = createStore({ syntax: false })
  const [focused, setFocused] = createSignal(true)
  const [visible, setVisible] = createSignal(true)
  const [dialogOpen, setDialogOpen] = createSignal(false)
  let finishDialog: ((value: string | undefined) => void) | undefined
  let prompt!: TextareaRenderable
  let panel!: BoxRenderable
  let order = 0
  let dialogOrder = 0
  const layers = new Set<{ factory: () => KeymapLayer; order: number }>()
  const focus = mock(() => {
    setFocused(true)
    panel?.focus()
  })
  const input: PanelInput = {
    name: DIFF_PANEL_NAME,
    sessionID: "test-session",
    width: 50,
    presentation: "panel",
    get focused() {
      return focused()
    },
    focus,
    close: () => setVisible(false),
    toggleFullscreen() {},
  }
  const color = RGBA.fromHex("#ffffff")
  const theme = {
    text: { base: color, muted: color, feedback: { warning: { base: color } } },
    diff: {
      text: { added: color, removed: color, context: color, hunkHeader: color },
      background: { added: color, removed: color, context: color },
    },
  }
  const context = {
    theme,
    storage: {
      memory: () => [state, (update: (draft: typeof state) => void) => setState(produce(update))],
      store: () => [settings, async (update: (draft: typeof settings) => void) => setSettings(produce(update))],
    },
    keymap: {
      layer(factory: () => KeymapLayer) {
        const layer = { factory, order: ++order }
        layers.add(layer)
        onCleanup(() => layers.delete(layer))
      },
    },
    ui: {
      panel: { close: () => setVisible(false) },
      dialog: {
        prompt: () => new Promise<string | undefined>((resolve) => {
          finishDialog = resolve
          dialogOrder = ++order
          setDialogOpen(true)
        }),
      },
      toast: { show() {} },
    },
  } as unknown as Context

  const app = await testRender(() => (
    <box flexDirection="row" width="100%" height="100%">
      <textarea id="chat-prompt" width={30} height={3} ref={(node) => { prompt = node }} />
      <Show when={visible()}>
        <box id="diff-panel" width={50} height="100%" focusable ref={(node) => { panel = node }}>
          <DiffPanel ctx={context} input={input} />
        </box>
      </Show>
      <Show when={dialogOpen()}>
        <box id="search-dialog" position="absolute" left={5} top={2} width={40} height={4} zIndex={10}>
          <text>Search in diff</text>
          <input focused width={38} />
        </box>
      </Show>
    </box>
  ), { width: 80, height: 24, kittyKeyboard: true })

  const enabled = (value: boolean | (() => boolean) | undefined) =>
    typeof value === "function" ? value() : value !== false

  // OpenCode owns panel input scopes and modal dispatch. This host double
  // applies priority/newest-layer ordering to the actual commands registered
  // by DiffPanel, without importing the host application into the plugin.
  const dispatch = (event: KeyEvent) => {
    const candidates: { priority: number; order: number; run: () => unknown }[] = []
    if (visible() && focused()) {
      for (const entry of layers) {
        const layer = entry.factory()
        if (!enabled(layer.enabled)) continue
        for (const command of layer.commands ?? []) {
          if (command.bind !== event.name || !enabled(command.enabled)) continue
          candidates.push({
            priority: layer.priority ?? 0,
            order: entry.order,
            run: () => command.run(undefined, event),
          })
        }
      }
    }
    if (dialogOpen() && event.name === "escape") {
      candidates.push({
        priority: 0,
        order: dialogOrder,
        run: () => {
          setDialogOpen(false)
          const finish = finishDialog
          finishDialog = undefined
          finish?.(undefined)
          panel.focus()
        },
      })
    }
    const selected = candidates.sort((a, b) => b.priority - a.priority || b.order - a.order)[0]
    if (!selected) return
    event.preventDefault()
    event.stopPropagation()
    selected.run()
  }
  app.renderer.keyInput.prependListener("keypress", dispatch)
  await app.flush()
  return {
    app,
    state,
    setState,
    focused,
    visible,
    dialogOpen,
    focus,
    focusPrompt() {
      setFocused(false)
      prompt.focus()
    },
    prompt: () => prompt,
    cleanup() {
      app.renderer.keyInput.off("keypress", dispatch)
      finishDialog?.(undefined)
      app.renderer.destroy()
    },
  }
}

describe("diff panel input", () => {
  test("leaves focus on the chat prompt and accepts typing while the diff is open", async () => {
    const fixture = await createPanelFixture()
    try {
      const calls = fixture.focus.mock.calls.length
      fixture.focusPrompt()
      await fixture.app.flush()
      expect(fixture.focused()).toBe(false)
      expect(fixture.focus.mock.calls.length).toBe(calls)

      await fixture.app.mockInput.typeText("please review s?jk")
      await fixture.app.flush()
      expect(fixture.prompt().plainText).toBe("please review s?jk")
      expect(fixture.visible()).toBe(true)
      expect(fixture.dialogOpen()).toBe(false)
    } finally {
      fixture.cleanup()
    }
  })

  test("focuses a newly opened file once without trapping later focus changes", async () => {
    const fixture = await createPanelFixture()
    try {
      fixture.focusPrompt()
      const calls = fixture.focus.mock.calls.length
      fixture.setState("file", "second.ts")
      await fixture.app.flush()

      expect(fixture.focused()).toBe(true)
      expect(fixture.focus.mock.calls.length).toBe(calls + 1)
      fixture.focusPrompt()
      await fixture.app.flush()
      expect(fixture.focused()).toBe(false)
      expect(fixture.focus.mock.calls.length).toBe(calls + 1)
    } finally {
      fixture.cleanup()
    }
  })

  test.each(["", "needle"])("Escape cancels the search dialog before changing the panel (query=%j)", async (query) => {
    const fixture = await createPanelFixture(query)
    try {
      fixture.app.mockInput.pressKey("?")
      await fixture.app.flush()
      expect(fixture.dialogOpen()).toBe(true)
      expect(fixture.app.renderer.root.findDescendantById("search-dialog")).toBeDefined()

      fixture.app.mockInput.pressEscape()
      await fixture.app.flush()
      expect(fixture.dialogOpen()).toBe(false)
      expect(fixture.app.renderer.root.findDescendantById("search-dialog")).toBeUndefined()
      expect(fixture.visible()).toBe(true)
      expect(fixture.state.panelOpen).toBe(true)
      expect(fixture.state.query).toBe(query)

      if (query) {
        fixture.app.mockInput.pressEscape()
        await fixture.app.flush()
        expect(fixture.state.query).toBe("")
        expect(fixture.visible()).toBe(true)
      }
      fixture.app.mockInput.pressEscape()
      await fixture.app.flush()
      expect(fixture.visible()).toBe(false)
      expect(fixture.state.panelOpen).toBe(false)
    } finally {
      fixture.cleanup()
    }
  })
})
