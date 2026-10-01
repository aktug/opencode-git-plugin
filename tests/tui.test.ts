import { describe, expect, test } from "bun:test"
import plugin, { parseDiff, parseStagedPorcelain } from "../src/tui"
import { displayWidth, filePathMaxWidth, truncatePath } from "../src/ui"

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

describe("module layout", () => {
  test("only .tsx files import runtime values from solid-js", async () => {
    const offenders: string[] = []
    for await (const file of new Bun.Glob("src/**/*.ts").scan()) {
      const source = await Bun.file(file).text()
      if (/^import (?!type\b)[^\n]*from "solid-js(?:\/[^"]*)?"/m.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

describe("truncatePath", () => {
  test("keeps paths that fit", () => {
    expect(truncatePath("src/tui.tsx", 11)).toBe("src/tui.tsx")
  })

  test("keeps the end of the path behind an ellipsis", () => {
    expect(truncatePath("src/sidebar/list-navigation.tsx", 20)).toBe("...st-navigation.tsx")
    expect(displayWidth(truncatePath("src/sidebar/list-navigation.tsx", 20))).toBe(20)
  })

  test("measures wide characters by terminal cells", () => {
    const result = truncatePath("docs/日本語のファイル.md", 12)
    expect(displayWidth(result)).toBeLessThanOrEqual(12)
    expect(result.endsWith(".md")).toBe(true)
  })

  test("never splits an emoji", () => {
    const result = truncatePath("assets/👩‍💻-icon.png", 12)
    expect(displayWidth(result)).toBeLessThanOrEqual(12)
    expect(result).not.toContain("‍")
  })
})

describe("filePathMaxWidth", () => {
  test("reserves the badge, counts and gaps", () => {
    expect(filePathMaxWidth(46, { additions: 5, deletions: 3 })).toBe(35)
  })

  test("uses the real width of large counts", () => {
    expect(filePathMaxWidth(46, { additions: 12345, deletions: 6789 })).toBe(46 - (3 + 6 + 5 + 4))
  })

  test("never goes below the minimum width", () => {
    expect(filePathMaxWidth(10, { additions: 1, deletions: 1 })).toBe(8)
  })
})
