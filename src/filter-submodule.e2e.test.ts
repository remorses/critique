// End-to-end tests for --filter behavior when dirty submodule diffs are merged.
// Uses real git repositories and real CLI invocations to mirror user workflows.

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import child_process from "child_process"
import fs from "fs"
import path from "path"
import stripAnsi from "strip-ansi"

const TEMP_ROOT = path.join(import.meta.dir, ".test-filter-submodule-e2e-tmp")
const CLI_PATH = path.join(import.meta.dir, "cli.tsx")

function runCommand(command: string, args: string[], cwd: string): string {
  return child_process.execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_ALLOW_PROTOCOL: "file",
    },
    stdio: ["pipe", "pipe", "pipe"],
  })
}

function runGit(cwd: string, args: string[]): string {
  return runCommand("git", args, cwd)
}

function configureGitIdentity(repoPath: string): void {
  runGit(repoPath, ["config", "user.name", "Critique Tests"])
  runGit(repoPath, ["config", "user.email", "tests@critique.local"])
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function createFixtureRepo(testName: string): string {
  const slug = testName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const fixtureRoot = fs.mkdtempSync(path.join(TEMP_ROOT, `${slug}-`))
  const submoduleSource = path.join(fixtureRoot, "submodule-source")
  const parentRepo = path.join(fixtureRoot, "parent-repo")

  fs.mkdirSync(submoduleSource, { recursive: true })
  runGit(submoduleSource, ["init"])
  configureGitIdentity(submoduleSource)
  writeFile(
    path.join(submoduleSource, "packages/react/src/widget.ts"),
    [
      "export const widget = 'submodule'",
      "export const widgetVersion = 1",
      "",
    ].join("\n"),
  )
  runGit(submoduleSource, ["add", "."])
  runGit(submoduleSource, ["commit", "-m", "initial submodule commit"])

  fs.mkdirSync(parentRepo, { recursive: true })
  runGit(parentRepo, ["init"])
  configureGitIdentity(parentRepo)
  writeFile(
    path.join(parentRepo, "src/root.ts"),
    [
      "export const rootFile = true",
      "export const rootVersion = 1",
      "",
    ].join("\n"),
  )
  runGit(parentRepo, ["add", "."])
  runGit(parentRepo, ["commit", "-m", "initial parent commit"])

  runGit(parentRepo, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    submoduleSource,
    "vendor/opentui",
  ])
  runGit(parentRepo, ["add", "."])
  runGit(parentRepo, ["commit", "-m", "add submodule"])

  fs.appendFileSync(path.join(parentRepo, "src/root.ts"), "export const rootChanged = true\n")
  fs.appendFileSync(
    path.join(parentRepo, "vendor/opentui/packages/react/src/widget.ts"),
    "export const submoduleChanged = true\n",
  )

  return parentRepo
}

function runCritiqueWithFilters(repoPath: string, filters: string[]): string {
  const args = [CLI_PATH, "--scrollback"]
  for (const filter of filters) {
    args.push("--filter", filter)
  }
  const output = runCommand("bun", args, repoPath)
  return stripAnsi(output).replace(/\r/g, "").trim()
}

describe("e2e: filter with dirty submodules", () => {
  beforeAll(() => {
    fs.mkdirSync(TEMP_ROOT, { recursive: true })
  })

  afterAll(() => {
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true })
  })

  test("user example: critique --scrollback --filter 'vendor/opentui/**'", () => {
    const repoPath = createFixtureRepo("submodule-glob-filter")
    const output = runCritiqueWithFilters(repoPath, ["vendor/opentui/**"])

    expect(output).toContain("vendor/opentui/packages/react/src/widget.ts")
    expect(output).toContain("submoduleChanged")
    expect(output).not.toContain("src/root.ts")
    expect(output).not.toContain("unknown +0-0")
  }, 120000)

  test("user example: critique --scrollback --filter 'src'", () => {
    const repoPath = createFixtureRepo("plain-path-filter")
    const output = runCritiqueWithFilters(repoPath, ["src"])

    expect(output).toContain("src/root.ts")
    expect(output).toContain("rootChanged")
    expect(output).not.toContain("vendor/opentui/packages/react/src/widget.ts")
    expect(output).not.toContain("unknown +0-0")
  }, 120000)

  test("user example: critique --scrollback --filter '.'", () => {
    const repoPath = createFixtureRepo("dot-root-filter")
    const output = runCritiqueWithFilters(repoPath, ["."])

    expect(output).toContain("src/root.ts")
    expect(output).toContain("vendor/opentui/packages/react/src/widget.ts")
    expect(output).not.toContain("unknown +0-0")
  }, 120000)
})
