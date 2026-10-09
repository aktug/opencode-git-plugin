import type { ChangeFile } from "../types"
import { buildFallbackFiles } from "./porcelain"
import type { GitRunner } from "./runner"

export type WorkingCopyFallback = {
  files: ChangeFile[]
  branch: string
  hasHead: boolean
}

function cleanBranchName(output: string): string {
  const name = output.split("\n", 1)[0]?.trim() ?? ""
  return name === "" || name === "HEAD" ? "" : name
}

export async function fetchWorkingCopyFallback(git: GitRunner): Promise<WorkingCopyFallback> {
  const statusRes = await git.run("status --porcelain=v1 -z -uall --no-renames")
  if (statusRes.exit !== 0) throw new Error("Not a git repository")
  const [cachedRes, worktreeRes, headRes, symRes] = await Promise.all([
    git.run("diff --cached --numstat -z --no-renames"),
    git.run("diff --numstat -z --no-renames"),
    git.run("rev-parse --verify HEAD --"),
    git.run("symbolic-ref --short HEAD"),
  ])
  let branch = symRes.exit === 0 ? cleanBranchName(symRes.output) : ""
  if (!branch) {
    const current = await git.run("branch --show-current")
    if (current.exit === 0) branch = cleanBranchName(current.output)
  }
  return {
    files: buildFallbackFiles(statusRes.output, cachedRes.output, worktreeRes.output),
    branch,
    hasHead: headRes.exit === 0,
  }
}
