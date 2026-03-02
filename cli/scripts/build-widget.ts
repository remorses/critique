#!/usr/bin/env bun
// Build the agentation widget bundle with react → preact/compat aliasing.
//
// Agentation has react/react-dom as external peer deps. We use a Bun plugin
// to redirect all react imports (including CJS require("react") inside
// agentation's dist) to preact/compat, ensuring a single runtime instance.

import type { BunPlugin } from "bun"

const preactAlias: BunPlugin = {
  name: "preact-alias",
  setup(build) {
    const aliases: Record<string, string> = {
      "react": "preact/compat",
      "react-dom": "preact/compat",
      "react-dom/client": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
      "react/jsx-dev-runtime": "preact/jsx-runtime",
    }

    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => {
      const target = aliases[args.path]
      if (target) {
        const resolved = import.meta.resolveSync(target)
        return { path: resolved }
      }
    })
  },
}

const result = await Bun.build({
  entrypoints: ["cli/src/agentation-widget.tsx"],
  outdir: "cli/public",
  naming: "agentation-widget.js",
  target: "browser",
  plugins: [preactAlias],
})

if (!result.success) {
  console.error("Widget build failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

const output = result.outputs[0]
console.log(`  agentation-widget.js  ${(output.size / 1024).toFixed(2)} KB`)
