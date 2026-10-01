import { onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { DIFF_PANEL_NAME } from "../config"
import type { RendererFocusEvents, RenderNode } from "../types"

export function bindSidebarFocus(
  ctx: Context,
  opts: { container: () => RenderNode | undefined; active: () => boolean; exit: () => void },
): void {
  const isInsideSidebar = (node: RenderNode | null | undefined) => {
    const container = opts.container()
    let current = node
    while (current) {
      if (current === container) return true
      current = current.parent
    }
    return false
  }

  const rendererEvents = ctx.renderer as unknown as RendererFocusEvents
  const handleFocusedRenderable = (current: RenderNode | null) => {
    if (!opts.active()) return
    if (ctx.ui.panel.current()?.name === DIFF_PANEL_NAME) return
    if (!isInsideSidebar(current)) opts.exit()
  }
  const handleFocusedEditor = (editor: unknown) => {
    if (editor == null) return
    if (opts.active()) opts.exit()
  }

  rendererEvents.on("focused_renderable", handleFocusedRenderable)
  rendererEvents.on("focused_editor", handleFocusedEditor)
  onCleanup(() => {
    rendererEvents.off("focused_renderable", handleFocusedRenderable)
    rendererEvents.off("focused_editor", handleFocusedEditor)
  })
}
