import type { Accessor } from "solid-js"
import type { Context, KeymapCommand } from "@opencode/plugin/tui/context"
import { LIST_NAV_MODE } from "../config"
import type { ChangeFile, FileBinds } from "../types"
import type { ListNavigation } from "./list-navigation"

export type FileActions = {
  next(): void
  prev(): void
  open(): void
  setStaged(stage: boolean): void
  commit(): void
}

function buildFileCommands(actions: FileActions, binds: FileBinds, palette: boolean, hasFiles: boolean): KeymapCommand[] {
  return [
    {
      id: "git-panel.next",
      title: "Git Panel: Next File",
      group: "Git Panel",
      bind: binds.next,
      enabled: hasFiles,
      run: () => actions.next(),
    },
    {
      id: "git-panel.prev",
      title: "Git Panel: Previous File",
      group: "Git Panel",
      bind: binds.prev,
      enabled: hasFiles,
      run: () => actions.prev(),
    },
    {
      id: "git-panel.open",
      title: "Git Panel: Open Diff",
      group: "Git Panel",
      bind: binds.open,
      palette: palette ? true : undefined,
      enabled: hasFiles,
      run: () => actions.open(),
    },
    {
      id: "git-panel.stage",
      title: "Git Panel: Stage File",
      group: "Git Panel",
      bind: binds.stage,
      palette: palette ? true : undefined,
      enabled: hasFiles,
      run: () => actions.setStaged(true),
    },
    {
      id: "git-panel.unstage",
      title: "Git Panel: Unstage File",
      group: "Git Panel",
      bind: binds.unstage,
      palette: palette ? true : undefined,
      enabled: hasFiles,
      run: () => actions.setStaged(false),
    },
    {
      id: "git-panel.commit",
      title: "Git Panel: Commit Staged",
      group: "Git Panel",
      bind: binds.commit,
      palette: palette ? true : undefined,
      run: () => actions.commit(),
    },
  ]
}

export function registerSidebarKeymaps(
  ctx: Context,
  deps: {
    files: Accessor<ChangeFile[]>
    nav: ListNavigation
    diffOpen: () => boolean
    actions: FileActions
    requestRefresh: () => void
  },
): void {
  const { files, nav, actions } = deps

  ctx.keymap.layer(() => {
    const hasFiles = files().length > 0
    return {
      mode: "global",
      bindings: ["git-panel.focus-list", "git-panel.next", "git-panel.prev", "git-panel.open", "git-panel.stage", "git-panel.unstage", "git-panel.commit"],
      commands: [
        {
          id: "git-panel.refresh",
          title: "Git Panel: Refresh",
          group: "Git Panel",
          palette: true,
          run: () => deps.requestRefresh(),
        },
        {
          id: "git-panel.focus-list",
          title: "Git Panel: Focus List",
          group: "Git Panel",
          bind: "<leader>G",
          palette: true,
          enabled: hasFiles,
          run: () => nav.enter(),
        },
        ...buildFileCommands(actions, {}, true, hasFiles),
      ],
    }
  })

  ctx.keymap.layer(() => {
    const hasFiles = files().length > 0
    const canExitNav = nav.navMode() && !deps.diffOpen() && !nav.stageMode()
    return {
      mode: LIST_NAV_MODE,
      priority: 10,
      bindings: ["git-panel.next", "git-panel.prev", "git-panel.open", "git-panel.stage", "git-panel.unstage", "git-panel.commit", "git-panel.exit-stage-mode", "git-panel.unfocus-list"],
      commands: [
        ...buildFileCommands(
          actions,
          { next: "down", prev: "up", open: "return", stage: "right", unstage: "left", commit: "c" },
          false,
          hasFiles,
        ),
        {
          id: "git-panel.exit-stage-mode",
          title: "Git Panel: Exit Stage Mode",
          group: "Git Panel",
          bind: "escape",
          enabled: nav.stageMode(),
          run: () => nav.setStageMode(false),
        },
        {
          id: "git-panel.unfocus-list",
          title: "Git Panel: Exit List Navigation",
          group: "Git Panel",
          bind: "escape",
          enabled: canExitNav,
          run: () => nav.exit(),
        },
      ],
    }
  })
}
