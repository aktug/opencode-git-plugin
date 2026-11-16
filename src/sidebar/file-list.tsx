/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { FILE_ROW_BADGE_WIDTH, type TreeStyle } from "../config"
import {
  buildFileTree,
  displayWidth,
  filePathMaxWidth,
  revealRow,
  rowWindow,
  statusBadge,
  truncatePath,
} from "../ui"
import type { ChangeFile } from "../types"

export function FileList(props: {
  ctx: Context
  files: ChangeFile[]
  staged: Set<string>
  selected: number
  navMode: boolean
  width: number
  maxRows: number
  treeStyle: TreeStyle
  collapsed: ReadonlySet<string>
  onSelect: (file: ChangeFile, index: number) => void
  onSelectDir: (dirPath: string) => void
}) {
  const ctx = props.ctx
  const [offset, setOffset] = createSignal(0)
  const rows = createMemo(() =>
    props.treeStyle === "none"
      ? props.files.map((file) => ({ kind: "file" as const, file, name: file.file, prefix: "" }))
      : buildFileTree(props.files, props.treeStyle, props.collapsed),
  )
  const indexByFile = createMemo(() => new Map(props.files.map((f, i) => [f.file, i])))
  const window = createMemo(() => rowWindow(rows().length, offset(), props.maxRows))
  const visible = createMemo(() => rows().slice(window().start, window().end))
  const page = (direction: number) =>
    setOffset((current) => rowWindow(rows().length, current + direction * props.maxRows, props.maxRows).start)

  createEffect(() => {
    const selected = props.selected
    const currentRows = rows()
    const size = props.maxRows
    const row = props.navMode
      ? currentRows.findIndex((item) => item.kind === "file" && indexByFile().get(item.file.file) === selected)
      : -1
    setOffset((current) => revealRow(row, current, currentRows.length, size))
  })

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
    <box flexDirection="column" gap={0} onMouseScroll={(event) => page(event.button === 0 ? 1 : -1)}>
      <Show when={window().above > 0}>
        <text fg={ctx.theme.text.muted} onMouseUp={() => page(-1)}>↑ {window().above} more</text>
      </Show>
      <For each={visible()}>
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
      <Show when={window().below > 0}>
        <text fg={ctx.theme.text.muted} onMouseUp={() => page(1)}>↓ {window().below} more</text>
      </Show>
    </box>
  )
}
