const SYNTAX_BY_LANGUAGE: Array<[string, string[]]> = [
  ["typescript", ["ts", "mts", "cts", "tsx", "mtsx", "js", "mjs", "cjs", "jsx"]],
  ["python", ["py"]],
  ["rust", ["rs"]],
  ["go", ["go"]],
  ["java", ["java"]],
  ["kotlin", ["kt", "kts"]],
  ["ruby", ["rb"]],
  ["php", ["php"]],
  ["swift", ["swift"]],
  ["c", ["c", "h"]],
  ["cpp", ["cpp", "cc", "hpp"]],
  ["csharp", ["cs"]],
  ["css", ["css"]],
  ["scss", ["scss"]],
  ["less", ["less"]],
  ["html", ["html", "htm"]],
  ["xml", ["xml"]],
  ["vue", ["vue"]],
  ["svelte", ["svelte"]],
  ["astro", ["astro"]],
  ["json", ["json"]],
  ["yaml", ["yaml", "yml"]],
  ["toml", ["toml"]],
  ["ini", ["ini"]],
  ["markdown", ["md", "markdown"]],
  ["bash", ["sh", "bash", "zsh"]],
  ["sql", ["sql"]],
  ["lua", ["lua"]],
  ["r", ["r"]],
  ["julia", ["jl"]],
  ["haskell", ["hs"]],
  ["ocaml", ["ml", "mli"]],
  ["elixir", ["ex", "exs"]],
  ["erlang", ["erl"]],
  ["clojure", ["clj", "cljs"]],
  ["scala", ["scala"]],
  ["groovy", ["groovy"]],
  ["dart", ["dart"]],
  ["zig", ["zig"]],
  ["nix", ["nix"]],
  ["terraform", ["tf"]],
  ["hcl", ["hcl"]],
  ["dockerfile", ["dockerfile"]],
  ["latex", ["tex"]],
  ["diff", ["diff", "patch"]],
]

const LANGUAGE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  SYNTAX_BY_LANGUAGE.flatMap(([lang, exts]) => exts.map((e) => [`.${e}`, lang])),
)

export function syntaxFiletype(file: string): string | undefined {
  const dot = file.lastIndexOf(".")
  if (dot < 0) {
    const base = file.split("/").pop()?.toLowerCase() ?? ""
    if (base === "dockerfile" || base === "makefile") return base
    return undefined
  }
  return LANGUAGE_BY_EXTENSION[file.slice(dot).toLowerCase()]
}
