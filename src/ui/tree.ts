import type { ChangeFile } from "../types"
import type { TreeStyle } from "../config"

export type TreeDisplayStyle = Exclude<TreeStyle, "none">

export type TreeRow =
  | { kind: "dir"; prefix: string; name: string; path: string }
  | { kind: "file"; prefix: string; name: string; file: ChangeFile }

type DirNode = {
  dirs: Map<string, DirNode>
  files: ChangeFile[]
}

type TreePrefixes = {
  branch: string
  lastBranch: string
  guide: string
  emptyGuide: string
  indent: string
}

const PREFIXES: Record<TreeDisplayStyle, TreePrefixes> = {
  comfortable: { branch: "├ ", lastBranch: "└ ", guide: "│ ", emptyGuide: "  ", indent: "" },
  compact: { branch: "├", lastBranch: "└", guide: "│", emptyGuide: " ", indent: "" },
  minimal: { branch: "", lastBranch: "", guide: "", emptyGuide: "", indent: " " },
}

const compareNames = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1)

const newNode = (): DirNode => ({ dirs: new Map(), files: [] })

function buildTree(files: ChangeFile[]): DirNode {
  const root = newNode()
  for (const f of files) {
    let node = root
    for (const part of f.file.split("/").slice(0, -1)) {
      let next = node.dirs.get(part)
      if (!next) {
        next = newNode()
        node.dirs.set(part, next)
      }
      node = next
    }
    node.files.push(f)
  }
  return root
}

export function buildFileTree(
  files: ChangeFile[],
  style: TreeDisplayStyle = "comfortable",
  collapsed: ReadonlySet<string> = new Set(),
): TreeRow[] {
  const rows: TreeRow[] = []
  const p = PREFIXES[style]

  const prefixOf = (depth: number, guides: boolean[], last: boolean): string => {
    if (depth === 0) return ""
    if (style === "minimal") return p.indent.repeat(depth)
    return guides.map((g) => (g ? p.guide : p.emptyGuide)).join("") + (last ? p.lastBranch : p.branch)
  }

  const render = (node: DirNode, depth: number, guides: boolean[], basePath: string) => {
    const dirNames = [...node.dirs.keys()].sort(compareNames)
    const sortedFiles = [...node.files].sort((a, b) => compareNames(baseName(a.file), baseName(b.file)))
    const total = dirNames.length + sortedFiles.length

    dirNames.forEach((name, i) => {
      const last = i === total - 1
      let label = `${name}/`
      let fullPath = `${basePath}${name}/`
      let child: DirNode | undefined = node.dirs.get(name)
      while (child && child.dirs.size === 1 && child.files.length === 0) {
        const [[nextName, next]] = child.dirs
        label += `${nextName}/`
        fullPath += `${nextName}/`
        child = next
      }
      rows.push({ kind: "dir", prefix: prefixOf(depth, guides, last), name: label, path: fullPath })
      if (child && !collapsed.has(fullPath)) render(child, depth + 1, [...guides, !last], fullPath)
    })

    sortedFiles.forEach((f, j) => {
      const last = dirNames.length + j === total - 1
      rows.push({ kind: "file", prefix: prefixOf(depth, guides, last), name: baseName(f.file), file: f })
    })
  }

  render(buildTree(files), 0, [], "")
  return rows
}
