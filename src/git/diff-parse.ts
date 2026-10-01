import type { DiffLine } from "../types"

const DIFF_PREAMBLE_RE = /^(diff --git |index |new file mode|deleted file mode|similarity index|rename from|rename to|old mode|new mode)/
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/

export function formatHunkHeader(raw: string): string {
  const m = raw.match(HUNK_HEADER_RE)
  if (!m) return raw
  const [, newStart, trailingContext] = m
  return trailingContext ? `⋯ ${trailingContext}` : `⋯ line ${newStart}`
}

export function parseDiff(patch: string): DiffLine[] {
  const out: DiffLine[] = []
  let newLine = 0
  for (const line of patch.split("\n")) {
    if (line === "") continue
    if (line.startsWith("@@")) {
      const m = line.match(HUNK_HEADER_RE)
      if (m) newLine = parseInt(m[1], 10)
      out.push({ kind: "hunk", text: formatHunkHeader(line) })
    } else if (line.startsWith("+++") || line.startsWith("---")) {
    } else if (DIFF_PREAMBLE_RE.test(line)) {
    } else if (line.startsWith("Binary files")) {
      out.push({ kind: "meta", text: line })
    } else if (line.startsWith("+")) {
      out.push({ kind: "add", text: line.slice(1), line: newLine++ })
    } else if (line.startsWith("-")) {
      out.push({ kind: "del", text: line.slice(1) })
    } else {
      out.push({ kind: "context", text: line.startsWith(" ") ? line.slice(1) : line, line: newLine++ })
    }
  }
  return out
}
