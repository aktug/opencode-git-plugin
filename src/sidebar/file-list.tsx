/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { FILE_ROW_BADGE_WIDTH, type TreeStyle } from "../config"
import { buildFileTree, displayWidth, filePathMaxWidth, statusBadge, truncatePath } from "../ui"
import type { ChangeFile } from "../types"

export function FileList(props: {
  ctx: Context
  files: ChangeFile[]
  staged: Set<string>
  selected: number
  navMode: boolean
  width: number
  treeStyle: TreeStyle
  collapsed: ReadonlySet<string>
  onSelect: (file: ChangeFile, index: number) => void
  onSelectDir: (dirPath: string) => void
}) {
  const ctx = props.ctx
  const rows = createMemo(() =>
    props.treeStyle === "none" ? [] : buildFileTree(props.files, props.treeStyle, props.collapsed),
  )
  const indexByFile = createMemo(() => new Map(props.files.map((f, i) => [f.file, i])))

  const pathLabel = (f: ChangeFile, name: string, prefix: string): string => {
    const max = Math.max(
      8,
      filePathMaxWidth(props.width, { additions: f.additions, deletions: f.deletions }) - displayWidth(prefix),
    )
    return prefix + truncatePath(name, max)
  }

  const fileRow = (f: ChangeFile, index: number, name: string, prefix: string) => {
    const b = statusBadge(f.status, ctx.theme)
    const label = () => (props.staged.has(f.file) ? `[${b.label}]` : ` ${b.label} `)
    return (
      <box flexDirection="row" gap={1} onMouseUp={() => props.onSelect(f, index)}>
        <text fg={b.color} width={FILE_ROW_BADGE_WIDTH}>
          <b>{label()}</b>
        </text>
        <text
          fg={props.navMode && index === props.selected ? ctx.theme.text.base : ctx.theme.text.muted}
          wrapMode="none"
        >
          {pathLabel(f, name, prefix)}
        </text>
        <box flexGrow={1} />
        <text fg={ctx.theme.diff.text.added}>+{f.additions}</text>
        <text fg={ctx.theme.diff.text.removed}>-{f.deletions}</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" gap={0}>
      <Show
        when={props.treeStyle !== "none"}
        fallback={
          <For each={props.files}>{(f, i) => fileRow(f, i(), f.file, "")}</For>
        }
      >
        <For each={rows()}>
          {(row) =>
            row.kind === "dir" ? (
              <box flexDirection="row" gap={1} onMouseUp={() => props.onSelectDir(row.path)}>
                <text fg={ctx.theme.text.muted} width={FILE_ROW_BADGE_WIDTH}>
                  {" "}
                </text>
                <text fg={ctx.theme.text.muted} wrapMode="none">
                  {row.prefix}
                  {props.collapsed.has(row.path) ? "▸ " : "▾ "}
                  {row.name}
                </text>
              </box>
            ) : (
              fileRow(row.file, indexByFile().get(row.file.file) ?? -1, row.name, row.prefix)
            )
          }
        </For>
      </Show>
    </box>
  )
}
