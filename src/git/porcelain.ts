export function parseStagedPorcelain(porcelain: string): Set<string> {
  const staged = new Set<string>()
  for (const record of porcelain.split("\0")) {
    if (record.length < 4) continue
    const indexStatus = record[0]
    if (indexStatus === " " || indexStatus === "?") continue
    staged.add(record.slice(3))
  }
  return staged
}
