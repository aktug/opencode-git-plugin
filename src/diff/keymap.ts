import type { Context, PanelInput } from "@opencode/plugin/tui/context"
import { DIFF_PANEL_NAME } from "../config"

export function registerDiffKeymap(
  ctx: Context,
  deps: {
    input: () => PanelInput
    searching: () => boolean
    hasMatches: () => boolean
    syntaxActive: () => boolean
    search(): void
    stepMatch(dir: 1 | -1): void
    clearSearch(): void
    close(): void
    toggleSyntax(): void
    scrollBy(delta: number): void
  },
): void {
  ctx.keymap.layer(() => {
    const searching = deps.searching()
    const hasMatches = deps.hasMatches()
    const inSyntax = deps.syntaxActive()
    return {
      mode: "global",
      priority: 20,
      enabled: () => deps.input().name === DIFF_PANEL_NAME,
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
          run: () => deps.search(),
        },
        {
          id: "git-panel.diff-next-match",
          title: "Git Panel: Next Diff Match",
          group: "Git Panel",
          bind: "down",
          enabled: searching && hasMatches,
          run: () => deps.stepMatch(1),
        },
        {
          id: "git-panel.diff-prev-match",
          title: "Git Panel: Previous Diff Match",
          group: "Git Panel",
          bind: "up",
          enabled: searching && hasMatches,
          run: () => deps.stepMatch(-1),
        },
        {
          id: "git-panel.diff-clear-search",
          title: "Git Panel: Clear Diff Search",
          group: "Git Panel",
          bind: "escape",
          enabled: searching,
          run: () => deps.clearSearch(),
        },
        {
          id: "git-panel.close-diff",
          title: "Git Panel: Close Diff",
          group: "Git Panel",
          bind: "escape",
          enabled: !searching,
          run: () => deps.close(),
        },
        {
          id: "git-panel.close-diff-backspace",
          title: "Git Panel: Close Diff (Backspace)",
          group: "Git Panel",
          bind: "backspace",
          enabled: !searching,
          run: () => deps.close(),
        },
        {
          id: "git-panel.toggle-syntax",
          title: "Git Panel: Toggle Diff Syntax Highlighting",
          group: "Git Panel",
          bind: "s",
          palette: true,
          run: () => deps.toggleSyntax(),
        },
        {
          id: "git-panel.syntax-down",
          title: "Git Panel: Scroll Syntax Diff Down",
          group: "Git Panel",
          bind: "j",
          enabled: inSyntax,
          run: () => deps.scrollBy(3),
        },
        {
          id: "git-panel.syntax-up",
          title: "Git Panel: Scroll Syntax Diff Up",
          group: "Git Panel",
          bind: "k",
          enabled: inSyntax,
          run: () => deps.scrollBy(-3),
        },
      ],
    }
  })
}
