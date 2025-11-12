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
import * as watcher from "@parcel/watcher";
import { debounce } from "./utils.ts";

const execAsync = promisify(exec);

const IGNORED_FILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
];

function execSyncWithError(
  command: string,
  options?: any,
): { data?: any; error?: string } {
  try {
    const data = execSync(command, options);
    return { data };
  } catch (error: any) {
    const stderr = error.stderr?.toString() || error.message || String(error);
    return { error: stderr };
  }
}

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
    if (key.name === "escape" || key.name === "q") {
      process.exit(0);
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
  .option("--watch", "Watch for file changes and refresh diff")
  .action(async (ref, options) => {
    try {
      const gitCommand = (() => {
        if (options.staged) return "git diff --cached --no-prefix";
        if (options.commit) return `git show ${options.commit} --no-prefix`;
        if (ref) return `git show ${ref} --no-prefix`;
        return "git add -N . && git diff --no-prefix";
      })();

      const [diffModule, { parsePatch }] = await Promise.all([
        import("./diff.tsx"),
        import("diff"),
      ]);

      const shouldWatch = options.watch && !ref && !options.commit;

      function AppWithWatch() {
        const [parsedFiles, setParsedFiles] = React.useState<Array<{
          oldFileName?: string;
          newFileName?: string;
          hunks: any[];
        }> | null>(null);

        React.useEffect(() => {
          const fetchDiff = async () => {
            try {
              const { stdout: gitDiff } = await execAsync(gitCommand, {
                encoding: "utf-8",
              });

              if (!gitDiff.trim()) {
                setParsedFiles([]);
                return;
              }

              const files = parsePatch(gitDiff);

              const filteredFiles = files.filter((file) => {
                const fileName = file.newFileName || file.oldFileName || "";
                const baseName = fileName.split("/").pop() || "";

                if (IGNORED_FILES.includes(baseName) || baseName.endsWith(".lock")) {
                  return false;
                }

                const totalLines = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
                return totalLines <= 6000;
              });

              const sortedFiles = filteredFiles.sort((a, b) => {
                const aSize = a.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
                const bSize = b.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
                return aSize - bSize;
              });

              setParsedFiles(sortedFiles);
            } catch (error) {
              setParsedFiles([]);
            }
          };

          fetchDiff();

          if (!shouldWatch) {
            return;
          }

          const cwd = process.cwd();

          const debouncedFetch = debounce(() => {
            fetchDiff();
          }, 200);

          let subscription: watcher.AsyncSubscription | undefined;

          watcher
            .subscribe(cwd, (err, events) => {
              if (err) {
                return;
              }

              if (events.length > 0) {
                debouncedFetch();
              }
            })
            .then((sub) => {
              subscription = sub;
            });

          return () => {
            if (subscription) {
              subscription.unsubscribe();
            }
          };
        }, []);

        if (parsedFiles === null) {
          return (
            <box style={{ padding: 1 }}>
              <text>Loading...</text>
            </box>
          );
        }

        if (parsedFiles.length === 0) {
          return (
            <box style={{ padding: 1 }}>
              <text>No changes to display</text>
            </box>
          );
        }

        return <App parsedFiles={parsedFiles} />;
      }

      const { ErrorBoundary } = diffModule;

      await render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(AppWithWatch)
        )
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
          React.createElement(App, { parsedFiles: [patch] })
        )
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
        appliedFiles: Map<string, boolean>; // Track which files have patches applied
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
            const { error } = execSyncWithError(
              `git checkout HEAD -- "${value}"`,
              { stdio: "pipe" },
            );

            if (error) {
              if (error.includes("did not match any file(s) known to git")) {
                if (fs.existsSync(value)) {
                  fs.unlinkSync(value);
                }
              } else {
                usePickStore.setState({
                  message: `Failed to restore ${value}: ${error}`,
                  messageType: "error",
                });
                return;
              }
            }

            usePickStore.setState((state) => ({
              selectedFiles: new Set(
                Array.from(state.selectedFiles).filter((f) => f !== value),
              ),
              appliedFiles: new Map(
                Array.from(state.appliedFiles).filter(([k]) => k !== value),
              ),
            }));
          } else {
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

            const result1 = execSyncWithError(
              `git apply --3way "${patchFile}"`,
              {
                stdio: "pipe",
              },
            );

            if (result1.error) {
              const result2 = execSyncWithError(`git apply "${patchFile}"`, {
                stdio: "pipe",
              });

              if (result2.error) {
                usePickStore.setState({
                  message: `Failed to apply ${value}: ${result2.error}`,
                  messageType: "error",
                });
                fs.unlinkSync(patchFile);
                return;
              }
            }

            fs.unlinkSync(patchFile);

            const { stdout: conflictCheck } = await execAsync(
              `git diff --name-only --diff-filter=U -- "${value}"`,
              { encoding: "utf-8" },
            );

            const hasConflict = conflictCheck.trim().length > 0;

            usePickStore.setState((state) => ({
              selectedFiles: new Set([...state.selectedFiles, value]),
              appliedFiles: new Map([...state.appliedFiles, [value, true]]),
              message: hasConflict ? `Applied ${value} with conflicts` : `Applied ${value}`,
              messageType: hasConflict ? "error" : "",
            }));
          }
        };

        return (
          <box style={{ padding: 1, flexDirection: "column" }}>
            <Dropdown
              tooltip={`Pick files from "${branch}"`}
              onChange={handleChange}
              selectedValues={Array.from(selectedFiles)}
              placeholder="Search files..."
              options={files.map((file) => ({
                value: file,
                title: "/" + file,
                keywords: file.split("/"),
              }))}
            />
            {message && (
              <box
                style={{
                  paddingLeft: 2,
                  paddingRight: 2,
                  paddingTop: 1,
                  paddingBottom: 1,
                  marginTop: 1,
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
// comment
cli.parse();
