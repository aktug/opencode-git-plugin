import { rm } from "node:fs/promises"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

await rm("dist", { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: ["./src/tui.tsx"],
  outdir: "./dist",
  naming: "tui.js",
  target: "bun",
  format: "esm",
  packages: "external",
  plugins: [createSolidTransformPlugin({ moduleName: "@opentui/solid" })],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

const output = await Bun.file("dist/tui.js").text()
if (output.includes("@opentui/solid/jsx-runtime") || output.includes("@opentui/solid/jsx-dev-runtime")) {
  console.error("dist/tui.js still uses the JSX runtime; the Solid transform did not run")
  process.exit(1)
}
