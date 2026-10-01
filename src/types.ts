import type { Context } from "@opencode/plugin/tui/context"

export type RenderNode = {
  parent?: RenderNode | null
  width: number
}

export type ScrollHandle = {
  scrollTop: number
  scrollTo(options: { x: number; y: number }): void
}

export type ChangeFile = {
  file: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}

export type DiffLineKind = "hunk" | "add" | "del" | "context" | "meta"
export type DiffLine = { kind: DiffLineKind; text: string; line?: number }

export type DiffViewState = {
  file: string
  additions: number
  deletions: number
  lines: DiffLine[]
  patch: string
  message: string
  truncated: boolean
  loading: boolean
  query: string
  matchCursor: number
  panelOpen: boolean
}

export type DiffRow = {
  kind: DiffLineKind
  text: string
  line: number | undefined
  state: "current" | "hit" | "plain"
}

export type FileBinds = {
  next?: string
  prev?: string
  open?: string
  stage?: string
  unstage?: string
  commit?: string
}

export type RendererFocusEvents = {
  on(event: "focused_renderable" | "focused_editor", listener: (...args: never[]) => void): void
  off(event: "focused_renderable" | "focused_editor", listener: (...args: never[]) => void): void
}

export type LayoutResizeEmitter = {
  on(event: "resize", listener: () => void): void
  off(event: "resize", listener: () => void): void
}

export type Theme = Context["theme"]
