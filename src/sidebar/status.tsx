/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"

export function SidebarStatus(props: {
  ctx: Context
  loading: boolean
  error: string | undefined
  hasFiles: boolean
  branch: string
}) {
  const ctx = props.ctx
  return (
    <>
      <Show when={props.loading}>
        <text fg={ctx.theme.text.muted}>Loading…</text>
      </Show>
      <Show when={!props.loading && props.error}>
        <text fg={ctx.theme.text.feedback.error.base}>{props.error}</text>
      </Show>
      <Show when={!props.loading && !props.error && !props.hasFiles && !props.branch}>
        <text fg={ctx.theme.text.muted}>Empty repo — no commits yet</text>
      </Show>
      <Show when={!props.loading && !props.error && !props.hasFiles && !!props.branch}>
        <text fg={ctx.theme.text.muted}>Working tree clean</text>
      </Show>
    </>
  )
}
