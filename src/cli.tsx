#!/usr/bin/env bun
import { cac } from "cac";
import {
  render,
  useKeyboard,
  useOnResize,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import * as React from "react";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import { MacOSScrollAccel } from "@opentui/core";
import fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as p from "@clack/prompts";
import { create } from "zustand";
import Dropdown from "./dropdown.tsx";

const execAsync = promisify(exec);

const cli = cac("critique");

class ScrollAcceleration {
  public multiplier: number = 1;
  private macosAccel: MacOSScrollAccel;
  constructor() {
    this.macosAccel = new MacOSScrollAccel();
  }
  tick(delta: number) {
    return this.macosAccel.tick(delta) * this.multiplier;
  }
  reset() {
    this.macosAccel.reset();
    // this.multiplier = 1;
  }
}

interface AppProps {
  parsedFiles: Array<{
    oldFileName?: string;
    newFileName?: string;
    hunks: any[];
  }>;
}

function App({ parsedFiles }: AppProps) {
  const { width: initialWidth } = useTerminalDimensions();
  const [width, setWidth] = React.useState(initialWidth);
  const [scrollAcceleration] = React.useState(() => new ScrollAcceleration());

  useOnResize(
    React.useCallback((newWidth: number) => {
      setWidth(newWidth);
    }, []),
  );
  const useSplitView = width >= 100;

  const renderer = useRenderer();

  useKeyboard((key) => {
    if (key.name === "z" && key.ctrl) {
      renderer.console.toggle();
    }
    if (key.option) {
      console.log(key);
      if (key.eventType === "release") {
        scrollAcceleration.multiplier = 1;
      } else {
        scrollAcceleration.multiplier = 10;
      }
    }
  });

  const { FileEditPreviewTitle, FileEditPreview } = require("./diff.tsx");

  return (
    <box
      key={String(useSplitView)}
      style={{ flexDirection: "column", height: "100%", padding: 1 }}
    >
      <scrollbox
        scrollAcceleration={scrollAcceleration}
        style={{
          flexGrow: 1,
          rootOptions: {
            backgroundColor: "transparent",
            border: false,
          },
          scrollbarOptions: {
            showArrows: false,
            trackOptions: {
              foregroundColor: "#4a4a4a",
              backgroundColor: "transparent",
            },
          },
        }}
        focused
      >
        <box style={{ flexDirection: "column" }}>
          {parsedFiles.map((file, idx) => (
            <box
              key={idx}
              style={{
                flexDirection: "column",
                marginBottom: idx < parsedFiles.length - 1 ? 2 : 0,
              }}
            >
              <FileEditPreviewTitle
                filePath={file.newFileName || file.oldFileName || "unknown"}
                hunks={file.hunks}
              />
              <box paddingTop={1} />
              <FileEditPreview
                hunks={file.hunks}
                paddingLeft={0}
                splitView={useSplitView}
                filePath={file.newFileName || file.oldFileName || ""}
              />
            </box>
          ))}
        </box>
      </scrollbox>
    </box>
  );
}

cli
  .command(
    "[ref]",
    "Show diff for a git reference (defaults to unstaged changes)",
  )
  .option("--staged", "Show staged changes")
  .option("--commit <ref>", "Show changes from a specific commit")
  .action(async (ref, options) => {
    try {
      const gitCommand = (() => {
        if (options.staged) return "git diff --cached --no-prefix";
        if (options.commit) return `git show ${options.commit} --no-prefix`;
        if (ref) return `git show ${ref} --no-prefix`;
        return "git diff --no-prefix";
      })();

      const [{ stdout: gitDiff }, diffModule, { parsePatch }] =
        await Promise.all([
          execAsync(gitCommand, { encoding: "utf-8" }),
          import("./diff.tsx"),
          import("diff"),
        ]);

      if (!gitDiff.trim()) {
        console.log("No changes to display");
        process.exit(0);
      }

      const parsedFiles = parsePatch(gitDiff);

      if (parsedFiles.length === 0) {
        console.log("No changes to display");
        process.exit(0);
      }

      const { ErrorBoundary } = diffModule;

      await render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(App, { parsedFiles }),
        ),
      );
    } catch (error) {
      console.error("Error getting git diff:", error);
      process.exit(1);
    }
  });

cli
  .command("difftool <local> <remote>", "Git difftool integration")
  .action(async (local: string, remote: string) => {
    if (!process.stdout.isTTY) {
      execSync(`git diff --no-ext-diff "${local}" "${remote}"`, {
        stdio: "inherit",
      });
      process.exit(0);
    }

    try {
      const [localContent, remoteContent, diffModule, { structuredPatch }] =
        await Promise.all([
          fs.readFileSync(local, "utf-8"),
          fs.readFileSync(remote, "utf-8"),
          import("./diff.tsx"),
          import("diff"),
        ]);

      const patch = structuredPatch(
        local,
        remote,
        localContent,
        remoteContent,
        "",
        "",
      );

      if (patch.hunks.length === 0) {
        console.log("No changes to display");
        process.exit(0);
      }

      const { ErrorBoundary } = diffModule;

      await render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(App, { parsedFiles: [patch] }),
        ),
      );
    } catch (error) {
      console.error("Error displaying diff:", error);
      process.exit(1);
    }
  });

cli
  .command("pick <branch>", "Pick files from another branch to apply to HEAD")
  .action(async (branch: string) => {
    try {
      const { stdout: currentBranch } = await execAsync(
        "git branch --show-current",
      );
      const current = currentBranch.trim();

      if (current === branch) {
        console.error("Cannot pick from the same branch");
        process.exit(1);
      }

      const { stdout: branchExists } = await execAsync(
        `git rev-parse --verify ${branch}`,
        { encoding: "utf-8" },
      ).catch(() => ({ stdout: "" }));

      if (!branchExists.trim()) {
        console.error(`Branch "${branch}" does not exist`);
        process.exit(1);
      }

      const { stdout: diffOutput } = await execAsync(
        `git diff --name-only HEAD...${branch}`,
        { encoding: "utf-8" },
      );

      const files = diffOutput
        .trim()
        .split("\n")
        .filter((f) => f);

      if (files.length === 0) {
        console.log("No differences found between branches");
        process.exit(0);
      }

      interface PickState {
        selectedFiles: Set<string>;
        appliedFiles: Map<string, string | undefined>;
        message: string;
        messageType: "info" | "error" | "success" | "";
      }

      const usePickStore = create<PickState>(() => ({
        selectedFiles: new Set(),
        appliedFiles: new Map(),
        message: "",
        messageType: "",
      }));

      interface PickAppProps {
        files: string[];
        branch: string;
      }

      function PickApp({ files, branch }: PickAppProps) {
        const selectedFiles = usePickStore((s) => s.selectedFiles);
        const message = usePickStore((s) => s.message);
        const messageType = usePickStore((s) => s.messageType);

        const handleChange = async (value: string) => {
          const isSelected = selectedFiles.has(value);

          if (isSelected) {
            const appliedFiles = usePickStore.getState().appliedFiles;
            const originalContent = appliedFiles.get(value);

            if (originalContent !== undefined) {
              fs.writeFileSync(value, originalContent);
              usePickStore.setState((state) => ({
                appliedFiles: new Map(
                  Array.from(state.appliedFiles).filter(([k]) => k !== value),
                ),
              }));
            }

            usePickStore.setState((state) => ({
              selectedFiles: new Set(
                Array.from(state.selectedFiles).filter((f) => f !== value),
              ),
            }));
          } else {
            const originalContent = fs.existsSync(value)
              ? fs.readFileSync(value, "utf-8")
              : undefined;

            const { stdout: mergeBase } = await execAsync(
              `git merge-base HEAD ${branch}`,
              { encoding: "utf-8" },
            );
            const base = mergeBase.trim();

            const { stdout: patchData } = await execAsync(
              `git diff ${base} ${branch} -- ${value}`,
              { encoding: "utf-8" },
            );

            const patchFile = join(
              tmpdir(),
              `critique-pick-${Date.now()}.patch`,
            );
            fs.writeFileSync(patchFile, patchData);

            try {
              try {
                execSync(`git apply --3way "${patchFile}"`, { stdio: "pipe" });
              } catch {
                execSync(`git apply "${patchFile}"`, { stdio: "pipe" });
              }

              usePickStore.setState((state) => ({
                selectedFiles: new Set([...state.selectedFiles, value]),
                appliedFiles: new Map([
                  ...state.appliedFiles,
                  [value, originalContent],
                ]),
                message: "",
                messageType: "",
              }));
            } catch (error) {
              usePickStore.setState({
                message: `Failed to apply patch for ${value}`,
                messageType: "error",
              });
            } finally {
              fs.unlinkSync(patchFile);
            }
          }
        };

        return (
          <box style={{ padding: 1, flexDirection: "column" }}>
            {message && (
              <box
                style={{
                  paddingLeft: 2,
                  paddingRight: 2,
                  paddingTop: 1,
                  paddingBottom: 1,
                  marginBottom: 1,
                }}
              >
                <text
                  fg={
                    messageType === "error"
                      ? "#ff6b6b"
                      : messageType === "success"
                        ? "#51cf66"
                        : "#ffffff"
                  }
                >
                  {message}
                </text>
              </box>
            )}
            <Dropdown
              tooltip={`Pick files from "${branch}"`}
              onChange={handleChange}
              value={Array.from(selectedFiles)[0]}
              placeholder="Search files..."
            >
              <Dropdown.Section>
                {files.map((file) => (
                  <Dropdown.Item
                    key={file}
                    value={file}
                    title={file}
                    keywords={file.split("/")}
                  />
                ))}
              </Dropdown.Section>
            </Dropdown>
          </box>
        );
      }

      await render(<PickApp files={files} branch={branch} />);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  });

cli.help();
cli.version("1.0.0");

cli.parse();
