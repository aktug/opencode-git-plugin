import { describe, expect, test } from "bun:test"
import plugin, { parseDiff, parseStagedPorcelain } from "../src/tui"

describe("TUI plugin", () => {
  test("exports the expected plugin id", () => {
    expect(plugin.id).toBe("git-panel.cli")
  })
})

describe("parseStagedPorcelain", () => {
  test("returns only index-staged paths without altering unusual names", () => {
    const porcelain = [
      "M  staged file.ts",
      " M unstaged.ts",
      "?? untracked.ts",
      "A  quote's.ts",
      "D  arrow -> literal.ts",
      "A  line\nbreak.ts",
      "",
    ].join("\0")

    expect([...parseStagedPorcelain(porcelain)]).toEqual([
      "staged file.ts",
      "quote's.ts",
      "arrow -> literal.ts",
      "line\nbreak.ts",
    ])
  })
})

describe("parseDiff", () => {
  test("removes the Git preamble and tracks new-file line numbers", () => {
    const patch = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1111111..2222222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -9,2 +9,3 @@ function value()",
      " context",
      "-old",
      "+new",
      "+added",
    ].join("\n")

    expect(parseDiff(patch)).toEqual([
      { kind: "hunk", text: "⋯ function value()" },
      { kind: "context", text: "context", line: 9 },
      { kind: "del", text: "old" },
      { kind: "add", text: "new", line: 10 },
      { kind: "add", text: "added", line: 11 },
    ])
  })

  test("keeps binary-file messages visible", () => {
    expect(parseDiff("Binary files a/image.png and b/image.png differ")).toEqual([
      { kind: "meta", text: "Binary files a/image.png and b/image.png differ" },
    ])
  })
})
