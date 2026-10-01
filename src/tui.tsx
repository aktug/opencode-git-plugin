/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { DiffPanel } from "./diff"
import { GitChangesView } from "./sidebar"

export { parseDiff, parseStagedPorcelain } from "./git"

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
