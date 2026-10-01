/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"

export function SidebarHeader(props: {
  ctx: Context
  branch: string
  fileCount: number
  ready: boolean
  additions: number
  deletions: number
  navMode: boolean
  stageMode: boolean
  hasStaged: boolean
  onBranchClick: () => void
  onCommit: () => void
}) {
  const ctx = props.ctx
  return (
    <box flexDirection="column" gap={0}>
      <box flexDirection="row" gap={1}>
        <text fg={ctx.theme.text.base}>
          <b>Git Panel</b>
        </text>
        <box flexGrow={1} />
        <Show when={props.branch && props.fileCount > 0}>
          <text fg={ctx.theme.text.muted} onMouseUp={() => props.onBranchClick()}>
            ▶ {props.branch}{" "}
          </text>
          <text fg={ctx.theme.text.base}>({props.fileCount})</text>
        </Show>
        <Show when={props.ready && props.fileCount > 0}>
          <text fg={ctx.theme.diff.text.added}>+{props.additions}</text>
          <text fg={ctx.theme.diff.text.removed}>-{props.deletions}</text>
        </Show>
      </box>
      <Show when={props.ready && props.fileCount > 0 && props.navMode}>
        <box flexDirection="row" gap={1}>
          <box flexGrow={1} />
          <Show
            when={props.stageMode}
            fallback={<text fg={ctx.theme.text.muted}>[← → : stage/unstage]</text>}
          >
            <text fg={ctx.theme.text.feedback.warning.base}>[click : stage/unstage]</text>
          </Show>
          <Show when={props.hasStaged}>
            <text fg={ctx.theme.text.feedback.success.base} onMouseUp={() => props.onCommit()}>
              [c : Commit]
            </text>
          </Show>
        </box>
      </Show>
    </box>
  )
}
