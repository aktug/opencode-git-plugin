import type { Context } from "@opencode/plugin/tui/context"
import { GIT_POLL_MS, GIT_TIMEOUT_MS } from "../config"

export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export type GitRunner = {
  enqueue<T>(op: () => Promise<T>): Promise<T>
  run(args: string): Promise<{ exit: number | undefined; output: string }>
}

export function createGitRunner(ctx: Context, directory: () => string): GitRunner {
  let queue: Promise<void> = Promise.resolve()
  const enqueue = <T,>(op: () => Promise<T>): Promise<T> => {
    const run = queue.then(op)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
  const run = async (args: string): Promise<{ exit: number | undefined; output: string }> => {
    const location = { directory: directory() }
    const created = await ctx.client.shell.create({
      location,
      command: `git ${args}`,
      cwd: location.directory,
    })
    const id = created.data.id
    try {
      let final = await ctx.client.shell.get({ id, location })
      for (let elapsed = 0; final.data.status === "running" && elapsed < GIT_TIMEOUT_MS; elapsed += GIT_POLL_MS) {
        await new Promise((resolve) => setTimeout(resolve, GIT_POLL_MS))
        final = await ctx.client.shell.get({ id, location })
      }
      if (final.data.status === "running") throw new Error(`Git command timed out after ${GIT_TIMEOUT_MS / 1000}s`)
      const out = await ctx.client.shell.output({ id, location })
      return { exit: final.data.exit, output: out.data.output }
    } finally {
      await ctx.client.shell.remove({ id, location }).catch(() => {})
    }
  }
  return { enqueue, run }
}
