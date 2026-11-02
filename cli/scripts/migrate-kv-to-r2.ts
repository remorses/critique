#!/usr/bin/env bun
// One-off migration of diff blobs from the old KV storage to the critique-diffs R2 bucket.
//
//   bun scripts/migrate-kv-to-r2.ts --dry-run --limit 20
//   bun scripts/migrate-kv-to-r2.ts                    # copy every diff blob
//   bun scripts/migrate-kv-to-r2.ts --delete-kv        # also delete each KV blob once it is in R2
//
// Deploys scripts/migrate-kv-to-r2-worker.ts as a temporary worker with the KV and R2
// bindings, sends it batches of keys, then deletes the worker. Safe to run again:
// objects already in R2 are skipped. Small KV records (license:, owner:, password:,
// checkout:, subscription:) are never copied or deleted.

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"
import type { MigrationKey, MigrationResult } from "./migrate-kv-to-r2-worker.ts"

// Same values as cli/wrangler.jsonc (production)
const KV_NAMESPACE_ID = "844b10c9fea049c8b20fa4a8c5cae44e"
const DEFAULT_BUCKET = "critique-diffs"
const WORKER_NAME = "critique-kv-to-r2-migration"
const CLI_DIR = path.join(import.meta.dir, "..")
const CALL_ATTEMPTS = 10
const RETRY_DELAY_MS = 3000

const { values: args } = parseArgs({
  options: {
    bucket: { type: "string", default: DEFAULT_BUCKET },
    limit: { type: "string" },
    batch: { type: "string", default: "40" },
    parallel: { type: "string", default: "4" },
    "dry-run": { type: "boolean", default: false },
    "delete-kv": { type: "boolean", default: false },
  },
})
const limit = args.limit ? Number(args.limit) : Infinity
const batchSize = Number(args.batch)
const parallel = Number(args.parallel)
const dryRun = args["dry-run"]
const deleteKv = args["delete-kv"]
const token = crypto.randomUUID()

function log(message: string) {
  console.log(`[migrate] ${message}`)
}

function wrangler(argv: string[]): string {
  const result = spawnSync("bunx", ["wrangler", ...argv], { cwd: CLI_DIR, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(`wrangler ${argv[0]} failed:\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout
}

// Retries because a fresh workers.dev deploy can answer 404/401 for a few seconds,
// and every endpoint is idempotent.
async function call<T>(workerUrl: string, pathname: string, init?: RequestInit): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${workerUrl}${pathname}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120_000),
      })
      if (!response.ok) throw new Error(`${pathname} returned ${response.status}: ${(await response.text()).slice(0, 120)}`)
      return (await response.json()) as T
    } catch (error) {
      if (attempt >= CALL_ATTEMPTS) throw error
      log(`retrying ${pathname.split("?")[0]} (attempt ${attempt}): ${error instanceof Error ? error.message : error}`)
      await Bun.sleep(RETRY_DELAY_MS)
    }
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "critique-migrate-"))
const configPath = path.join(tmpDir, "wrangler.json")
fs.writeFileSync(configPath, JSON.stringify({
  name: WORKER_NAME,
  main: path.join(import.meta.dir, "migrate-kv-to-r2-worker.ts"),
  compatibility_date: "2025-05-26",
  workers_dev: true,
  kv_namespaces: [{ binding: "KV", id: KV_NAMESPACE_ID }],
  r2_buckets: [{ binding: "BUCKET", bucket_name: args.bucket }],
}))

const counts: Record<MigrationResult["status"] | "deletedKv", number> = {
  record: 0, exists: 0, "would-copy": 0, copied: 0, missing: 0, failed: 0, deletedKv: 0,
}
let kvBytes = 0
let r2Bytes = 0

try {
  log(`KV ${KV_NAMESPACE_ID} → R2 ${args.bucket}${dryRun ? " (dry run)" : ""}${deleteKv ? " (deleting KV blobs)" : ""}`)
  log(`deploying temporary worker ${WORKER_NAME}`)
  const deployOutput = wrangler(["deploy", "--config", configPath, "--var", `MIGRATION_TOKEN:${token}`])
  const workerUrl = deployOutput.match(/https:\/\/\S+\.workers\.dev/)?.[0]
  if (!workerUrl) throw new Error(`No workers.dev URL in deploy output:\n${deployOutput}`)
  log(`deployed ${workerUrl}`)

  let page = await call<{ keys: MigrationKey[]; cursor: string | null }>(workerUrl, "/list")

  const keys: MigrationKey[] = [...page.keys]
  while (page.cursor && keys.length < limit) {
    log(`listed ${keys.length} keys`)
    page = await call<{ keys: MigrationKey[]; cursor: string | null }>(workerUrl, `/list?cursor=${encodeURIComponent(page.cursor)}`)
    keys.push(...page.keys)
  }
  const todo = keys.slice(0, limit)
  log(`listed ${keys.length} keys, migrating ${todo.length} in batches of ${batchSize}`)

  const batches: MigrationKey[][] = []
  for (let i = 0; i < todo.length; i += batchSize) batches.push(todo.slice(i, i + batchSize))
  let done = 0

  await Promise.all(Array.from({ length: parallel }, async () => {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      const { results } = await call<{ results: MigrationResult[] }>(workerUrl, "/migrate", {
        method: "POST",
        body: JSON.stringify({ keys: batch, dryRun, deleteKv }),
      })
      for (const result of results) {
        counts[result.status]++
        if (result.deletedKv) counts.deletedKv++
        kvBytes += result.kvBytes ?? 0
        r2Bytes += result.r2Bytes ?? 0
        if (result.status === "failed") console.error(`[migrate] FAILED ${result.name}: ${result.error}`)
        else if (result.status !== "record") {
          const sizes = result.kvBytes ? ` ${Math.round(result.kvBytes / 1024)} KB → ${Math.round((result.r2Bytes ?? 0) / 1024)} KB` : ""
          log(`${result.status} ${result.name} → ${result.r2Key}${sizes}${result.deletedKv ? " (KV deleted)" : ""}`)
        }
      }
      done += batch.length
      log(`progress ${done}/${todo.length} ${JSON.stringify(counts)} copied ${(kvBytes / 1e9).toFixed(2)} GB → ${(r2Bytes / 1e9).toFixed(2)} GB`)
    }
  }))
} finally {
  log(`deleting temporary worker ${WORKER_NAME}`)
  try {
    wrangler(["delete", "--config", configPath, "--force"])
  } catch (error) {
    console.error(`[migrate] could not delete ${WORKER_NAME}, delete it by hand:`, error)
  }
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

log(`done ${JSON.stringify(counts)}`)
if (counts.failed > 0) process.exit(1)
