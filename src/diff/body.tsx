/** @jsxImportSource @opentui/solid */
import { For, Show } from "solid-js"
import type { generateSyntax } from "@opencode/theme/tui"
import { diffLinePrefix, diffLineStyle, syntaxFiletype } from "../ui"
import type { DiffRow, DiffViewState, ScrollHandle, Theme } from "../types"

function DiffLineRow(props: { theme: Theme; row: DiffRow; index: number }) {
  const theme = props.theme
  const row = props.row
  const style = diffLineStyle(theme, row.kind)
  const isCurrent = row.state === "current"
  const gutter = row.line !== undefined ? String(row.line).padStart(4, " ") : "    "
  const fg = isCurrent
    ? theme.diff.background.context
    : row.state === "hit"
      ? theme.text.feedback.warning.base
      : style.fg
  const bg = isCurrent ? theme.text.feedback.warning.base : style.bg
  return (
    <box flexDirection="row" width="100%" id={`git-panel-diff-line-${props.index}`}>
      <text fg={isCurrent ? theme.text.feedback.warning.base : theme.text.muted} width={5}>
        {isCurrent ? `❯${gutter.slice(1)}` : `${gutter} `}
      </text>
      <text fg={fg} bg={bg} wrapMode="word" flexGrow={1}>
        {diffLinePrefix(row.kind)}
        {row.text}
      </text>
    </box>
  )
}

export function DiffBody(props: {
  theme: Theme
  state: DiffViewState
  rows: DiffRow[]
  focused: boolean
  syntaxActive: boolean
  syntaxStyle: ReturnType<typeof generateSyntax> | undefined
  onScrollRef: (el: ScrollHandle) => void
}) {
  const theme = props.theme
  return (
    <>
      <Show when={props.state.loading}>
        <text fg={theme.text.muted}>Loading diff…</text>
      </Show>
      <Show when={!props.state.loading && props.state.message}>
        <text fg={theme.text.muted}>{props.state.message}</text>
      </Show>
      <Show when={!props.state.loading && !props.state.message}>
        <scrollbox
          width="100%"
          flexGrow={1}
          flexShrink={1}
          minHeight={0}
          scrollY
          scrollX={false}
          focused={props.focused}
          ref={(el) => props.onScrollRef(el)}
          contentOptions={{ flexDirection: "column", gap: 0 }}
          wrapperOptions={{ paddingRight: 1 }}
        >
          <Show when={props.syntaxActive}>
            <diff
              diff={props.state.patch}
              view="unified"
              filetype={syntaxFiletype(props.state.file)}
              syntaxStyle={props.syntaxStyle}
              showLineNumbers
              wrapMode="word"
              fg={theme.text.base}
              addedBg={theme.diff.background.added}
              removedBg={theme.diff.background.removed}
              contextBg={theme.diff.background.context}
              addedSignColor={theme.diff.text.added}
              removedSignColor={theme.diff.text.removed}
              lineNumberFg={theme.text.muted}
            />
          </Show>
          <Show when={!props.syntaxActive}>
            <For each={props.rows}>{(row, i) => <DiffLineRow theme={theme} row={row} index={i()} />}</For>
          </Show>
          <Show when={props.state.truncated}>
            <text fg={theme.text.muted}>… truncated</text>
          </Show>
        </scrollbox>
      </Show>
    </>
  )
}
