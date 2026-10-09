import { describe, expect, test } from "bun:test"
import plugin, {
  buildFallbackFiles,
  buildFileTree,
  parseDiff,
  parseNumstat,
  parsePorcelainRecords,
  parseStagedPorcelain,
  porcelainChangeStatus,
} from "../src/tui"
import { displayWidth, filePathMaxWidth, truncatePath } from "../src/ui"
import { shouldStageAll, buildStageArgs } from "../src/sidebar/staging"

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

describe("parsePorcelainRecords", () => {
  test("splits -z porcelain into index/worktree codes", () => {
    const porcelain = ["A  staged.ts", "AM both.ts", " M unstaged.ts", "?? untracked.ts", ""].join("\0")

    expect(parsePorcelainRecords(porcelain)).toEqual([
      { x: "A", y: " ", file: "staged.ts" },
      { x: "A", y: "M", file: "both.ts" },
      { x: " ", y: "M", file: "unstaged.ts" },
      { x: "?", y: "?", file: "untracked.ts" },
    ])
  })

  test("keeps unusual names intact", () => {
    const porcelain = ["A  quote's.ts", "A  arrow -> literal.ts", "A  line\nbreak.ts", ""].join("\0")

    expect(parsePorcelainRecords(porcelain).map((r) => r.file)).toEqual([
      "quote's.ts",
      "arrow -> literal.ts",
      "line\nbreak.ts",
    ])
  })
})

describe("porcelainChangeStatus", () => {
  test("maps XY codes onto badges", () => {
    expect(porcelainChangeStatus("?", "?")).toBe("added")
    expect(porcelainChangeStatus("A", " ")).toBe("added")
    expect(porcelainChangeStatus("A", "M")).toBe("added")
    expect(porcelainChangeStatus(" ", "M")).toBe("modified")
    expect(porcelainChangeStatus("M", " ")).toBe("modified")
    expect(porcelainChangeStatus(" ", "D")).toBe("deleted")
    expect(porcelainChangeStatus("D", " ")).toBe("deleted")
  })
})

describe("parseNumstat", () => {
  test("parses -z numstat records", () => {
    const output = ["1\t0\ta.txt", "3\t2\tsub/b.txt", ""].join("\0")

    expect(parseNumstat(output)).toEqual(
      new Map([
        ["a.txt", { additions: 1, deletions: 0 }],
        ["sub/b.txt", { additions: 3, deletions: 2 }],
      ]),
    )
  })

  test("treats binary files as zero counts", () => {
    expect(parseNumstat("-\t-\timage.png\0")).toEqual(
      new Map([["image.png", { additions: 0, deletions: 0 }]]),
    )
  })
})

describe("buildFallbackFiles", () => {
  test("lists staged and untracked files of a HEAD-less repo", () => {
    const porcelain = ["A  a.txt", "?? sub/b.txt", ""].join("\0")
    const cached = ["1\t0\ta.txt", ""].join("\0")

    expect(buildFallbackFiles(porcelain, cached, "")).toEqual([
      { file: "a.txt", status: "added", additions: 1, deletions: 0 },
      { file: "sub/b.txt", status: "added", additions: 0, deletions: 0 },
    ])
  })

  test("sums staged and unstaged counts", () => {
    const porcelain = ["AM a.txt", " M b.txt", " D c.txt", ""].join("\0")
    const cached = ["1\t0\ta.txt", ""].join("\0")
    const worktree = ["2\t1\ta.txt", "0\t5\tc.txt", ""].join("\0")

    expect(buildFallbackFiles(porcelain, cached, worktree)).toEqual([
      { file: "a.txt", status: "added", additions: 3, deletions: 1 },
      { file: "b.txt", status: "modified", additions: 0, deletions: 0 },
      { file: "c.txt", status: "deleted", additions: 0, deletions: 5 },
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

describe("buildFileTree", () => {
  const file = (name: string) => ({ file: name, additions: 0, deletions: 0, status: "modified" as const })

  test("groups nested paths with branch prefixes", () => {
    const rows = buildFileTree([
      file("src/sidebar/file-list.tsx"),
      file("src/git/porcelain.ts"),
      file("README.md"),
    ])

    expect(rows).toEqual([
      { kind: "dir", prefix: "", name: "src/", path: "src/" },
      { kind: "dir", prefix: "│ ├ ", name: "git/", path: "src/git/" },
      { kind: "file", prefix: "│ │ └ ", name: "porcelain.ts", file: file("src/git/porcelain.ts") },
      { kind: "dir", prefix: "│ └ ", name: "sidebar/", path: "src/sidebar/" },
      {
        kind: "file",
        prefix: "│   └ ",
        name: "file-list.tsx",
        file: file("src/sidebar/file-list.tsx"),
      },
      { kind: "file", prefix: "", name: "README.md", file: file("README.md") },
    ])
  })

  test("sorts directories before files", () => {
    const rows = buildFileTree([file("b.txt"), file("a/c.txt")])

    expect(rows.map((r) => `${r.kind}:${r.name}`)).toEqual(["dir:a/", "file:c.txt", "file:b.txt"])
  })

  test("renders compact prefixes at one column per level", () => {
    const rows = buildFileTree([file("src/git/porcelain.ts"), file("src/sidebar/view.tsx")], "compact")

    expect(rows.map((r) => `${r.prefix}${r.name}`)).toEqual([
      "src/",
      " ├git/",
      " │└porcelain.ts",
      " └sidebar/",
      "  └view.tsx",
    ])
  })

  test("renders minimal prefixes as plain indentation", () => {
    const rows = buildFileTree([file("src/git/porcelain.ts"), file("src/sidebar/view.tsx")], "minimal")

    expect(rows.map((r) => `${r.prefix}${r.name}`)).toEqual([
      "src/",
      " git/",
      "  porcelain.ts",
      " sidebar/",
      "  view.tsx",
    ])
  })

  test("hides the children of collapsed directories", () => {
    const files = [file("src/sidebar/file-list.tsx"), file("src/git/porcelain.ts"), file("README.md")]

    expect(buildFileTree(files, "comfortable", new Set(["src/git/"])).map((r) => r.name)).toEqual([
      "src/",
      "git/",
      "sidebar/",
      "file-list.tsx",
      "README.md",
    ])
    expect(buildFileTree(files, "comfortable", new Set(["src/"])).map((r) => r.name)).toEqual([
      "src/",
      "README.md",
    ])
  })

  test("collapses single-child directory chains", () => {
    const f = file("sub/nested/deep.ts")
    const rows = buildFileTree([f])

    expect(rows).toEqual([
      { kind: "dir", prefix: "", name: "sub/nested/", path: "sub/nested/" },
      { kind: "file", prefix: "  └ ", name: "deep.ts", file: f },
    ])
    expect(rows.find((r) => r.kind === "file" && r.file === f)).toBeDefined()
  })
})

describe("shouldStageAll", () => {
  test("unstages only when every file is already staged", () => {
    expect(shouldStageAll(["a", "b"], new Set(["a", "b"]))).toBe(false)
  })

  test("stages when any file is unstaged", () => {
    expect(shouldStageAll(["a", "b"], new Set(["a"]))).toBe(true)
    expect(shouldStageAll(["a", "b"], new Set())).toBe(true)
  })

  test("does nothing meaningful for an empty group", () => {
    expect(shouldStageAll([], new Set(["a"]))).toBe(false)
  })
})

describe("buildStageArgs", () => {
  test("quotes every path in a single batch command", () => {
    expect(buildStageArgs(true, ["a.txt", "sub/b file.ts", "quote's.ts"])).toBe(
      `add -- 'a.txt' 'sub/b file.ts' 'quote'\\''s.ts'`,
    )
    expect(buildStageArgs(false, ["a.txt", "b.txt"])).toBe("restore --staged -- 'a.txt' 'b.txt'")
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
