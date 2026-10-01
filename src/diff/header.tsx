/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"
import { displayWidth, maxTextWidth, truncatePath } from "../ui"
import type { Theme } from "../types"

export function DiffHeader(props: {
  theme: Theme
  width: number
  file: string
  additions: number
  deletions: number
  query: string
  matchCursor: number
  matchCount: number
  syntax: boolean
  onSearch: () => void
  onToggleSyntax: () => void
  onClose: () => void
}) {
  const theme = props.theme
  return (
    <box flexDirection="column" gap={0} flexShrink={0}>
      <box flexDirection="row" width={Math.max(1, props.width)} flexShrink={0}>
        <text fg={theme.text.base} wrapMode="none" flexShrink={0}>
          <b>
            {truncatePath(
              props.file,
              maxTextWidth(
                props.width,
                displayWidth(`+${props.additions}`) + 1 + displayWidth(`-${props.deletions}`) + 1,
              ),
            )}
          </b>
        </text>
        <box flexGrow={1} />
        <box flexDirection="row" gap={1} flexShrink={0}>
          <text fg={theme.diff.text.added} wrapMode="none" flexShrink={0}>
            +{props.additions}
          </text>
          <text fg={theme.diff.text.removed} wrapMode="none" flexShrink={0}>
            -{props.deletions}
          </text>
        </box>
      </box>
      <Show when={props.query}>
        <text fg={theme.text.feedback.warning.base} wrapMode="none">
          {props.matchCount > 0 ? `${props.matchCursor + 1}/${props.matchCount}` : "0/0"} · {props.query}
        </text>
      </Show>
      <box height={1} flexShrink={0} />
      <box flexDirection="row" flexWrap="wrap" width={Math.max(1, props.width)} gap={1} flexShrink={0}>
        <text fg={theme.text.muted} wrapMode="none" flexShrink={0} onMouseUp={() => props.onSearch()}>
          [? : Search]
        </text>
        <Show when={props.query}>
          <text fg={theme.text.muted} wrapMode="none" flexShrink={0}>
            [↑↓ : Jump]
          </text>
        </Show>
        <text
          fg={props.syntax ? theme.text.feedback.warning.base : theme.text.muted}
          wrapMode="none"
          flexShrink={0}
          onMouseUp={() => props.onToggleSyntax()}
        >
          {props.syntax ? "[syntax:on]" : "[syntax:off]"}
        </text>
        <text fg={theme.text.base} wrapMode="none" flexShrink={0} onMouseUp={() => props.onClose()}>
          [ Close · ESC/⌫ ]
        </text>
      </box>
      <text fg={theme.text.muted} wrapMode="none">
        {"─".repeat(Math.max(1, props.width))}
      </text>
    </box>
  )
}
