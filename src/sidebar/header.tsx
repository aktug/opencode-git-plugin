/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { displayWidth, truncatePath } from "../ui"

export function SidebarHeader(props: {
  ctx: Context
  branch: string
  width: number
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
      <box flexDirection="row">
        <text fg={ctx.theme.text.base} wrapMode="none">
          <b>Git Panel</b>
        </text>
      </box>
      <text fg={ctx.theme.border.base} wrapMode="none">
        {"─".repeat(Math.max(1, props.width - 1))}
      </text>
      <Show when={props.branch && props.fileCount > 0}>
        <box flexDirection="row" gap={1} onMouseUp={() => props.onBranchClick()}>
          <text fg={ctx.theme.text.muted} wrapMode="none">
            ▶ {truncatePath(props.branch, Math.max(1, props.width - displayWidth(`▶  (${props.fileCount})`) - 1))}
          </text>
          <text fg={ctx.theme.text.base} wrapMode="none">({props.fileCount})</text>
        </box>
      </Show>
      <Show when={props.ready && props.fileCount > 0}>
        <box flexDirection="row" gap={1}>
          <box flexGrow={1} />
          <text fg={ctx.theme.diff.text.added} wrapMode="none">+{props.additions}</text>
          <text fg={ctx.theme.diff.text.removed} wrapMode="none">-{props.deletions}</text>
        </box>
      </Show>
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
