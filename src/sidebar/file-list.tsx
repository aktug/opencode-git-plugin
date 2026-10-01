/** @jsxImportSource @opentui/solid */
import { For } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { FILE_ROW_BADGE_WIDTH } from "../config"
import { filePathMaxWidth, statusBadge, truncatePath } from "../ui"
import type { ChangeFile } from "../types"

export function FileList(props: {
  ctx: Context
  files: ChangeFile[]
  staged: Set<string>
  selected: number
  navMode: boolean
  width: number
  onSelect: (file: ChangeFile, index: number) => void
}) {
  const ctx = props.ctx
  return (
    <box flexDirection="column" gap={0}>
      <For each={props.files}>
        {(f, i) => {
          const b = statusBadge(f.status, ctx.theme)
          const label = () => (props.staged.has(f.file) ? `[${b.label}]` : ` ${b.label} `)
          return (
            <box flexDirection="row" gap={1} onMouseUp={() => props.onSelect(f, i())}>
              <text fg={b.color} width={FILE_ROW_BADGE_WIDTH}>
                <b>{label()}</b>
              </text>
              <text
                fg={props.navMode && i() === props.selected ? ctx.theme.text.base : ctx.theme.text.muted}
                wrapMode="none"
              >
                {truncatePath(
                  f.file,
                  filePathMaxWidth(props.width, { additions: f.additions, deletions: f.deletions }),
                )}
              </text>
              <box flexGrow={1} />
              <text fg={ctx.theme.diff.text.added}>+{f.additions}</text>
              <text fg={ctx.theme.diff.text.removed}>-{f.deletions}</text>
            </box>
          )
        }}
      </For>
    </box>
  )
}
