#!/usr/bin/env bun
import { cac } from "cac";
import { FileEditPreviewTitle, FileEditPreview } from "./diff.tsx";
import {
  createRoot,
  useKeyboard,
  useOnResize,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import * as React from "react";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import { createCliRenderer, MacOSScrollAccel } from "@opentui/core";
import fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
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

const BACKGROUND_COLOR = "#0f0f0f";

function getFileName(file: { oldFileName?: string; newFileName?: string }): string {
  const newName = file.newFileName;
  const oldName = file.oldFileName;

  // Filter out /dev/null which appears for new/deleted files
  if (newName && newName !== "/dev/null") return newName;
  if (oldName && oldName !== "/dev/null") return oldName;

  return "unknown";
}

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

interface DiffState {
  currentFileIndex: number;
}

const useDiffStore = create<DiffState>(() => ({
  currentFileIndex: 0,
}));

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
  const currentFileIndex = useDiffStore((s) => s.currentFileIndex);
  const [showDropdown, setShowDropdown] = React.useState(false);

  useOnResize(
    React.useCallback((newWidth: number) => {
      setWidth(newWidth);
    }, []),
  );
  const useSplitView = width >= 100;

  const renderer = useRenderer();

  useKeyboard((key) => {
    if (showDropdown) {
      if (key.name === "escape") {
        setShowDropdown(false);
      }
      return;
    }

    if (key.name === "p" && key.ctrl) {
      setShowDropdown(true);
      return;
    }

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
    if (key.name === "left") {
      useDiffStore.setState((state) => ({
        currentFileIndex: Math.max(0, state.currentFileIndex - 1),
      }));
    }
    if (key.name === "right") {
      useDiffStore.setState((state) => ({
        currentFileIndex: Math.min(parsedFiles.length - 1, state.currentFileIndex + 1),
      }));
    }
  });

  const { FileEditPreview } = require("./diff.tsx");

  // Ensure current index is valid
  const validIndex = Math.min(currentFileIndex, parsedFiles.length - 1);
  const currentFile = parsedFiles[validIndex];

  if (!currentFile) {
    return (
      <box style={{ padding: 1, backgroundColor: BACKGROUND_COLOR }}>
        <text>No files to display</text>
      </box>
    );
  }

  const fileName = getFileName(currentFile);

  // Calculate additions and deletions
  let additions = 0;
  let deletions = 0;
  currentFile.hunks.forEach((hunk: any) => {
    hunk.lines.forEach((line: string) => {
      if (line.startsWith("+")) additions++;
      if (line.startsWith("-")) deletions++;
    });
  });

  const dropdownOptions = parsedFiles.map((file, idx) => {
    const name = getFileName(file);
    return {
      title: name,
      value: String(idx),
      keywords: name.split("/"),
    };
  });

  const handleFileSelect = (value: string) => {
    const index = parseInt(value, 10);
    useDiffStore.setState({ currentFileIndex: index });
    setShowDropdown(false);
  };

  if (showDropdown) {
    return (
      <box
        style={{ flexDirection: "column", height: "100%", padding: 1, backgroundColor: BACKGROUND_COLOR }}
      >
        <box style={{ flexDirection: "column", justifyContent: "center", flexGrow: 1 }}>
          <Dropdown
            tooltip="Select file"
            options={dropdownOptions}
            selectedValues={[String(validIndex)]}
            onChange={handleFileSelect}
            placeholder="Search files..."
          />
        </box>
      </box>
    );
  }

  return (
    <box
      key={String(useSplitView)}
      style={{ flexDirection: "column", height: "100%", padding: 1, backgroundColor: BACKGROUND_COLOR }}
    >
      {/* Navigation header */}
      <box style={{ paddingBottom: 1, paddingLeft: 1, paddingRight: 1, flexShrink: 0, flexDirection: "row", alignItems: "center" }}>
        <text fg="#ffffff">←</text>
        <box flexGrow={1} />
        <text onMouseDown={() => setShowDropdown(true)}>
          {fileName.trim()}
        </text>
        <text fg="#00ff00"> +{additions}</text>
        <text fg="#ff0000">-{deletions}</text>
        <box flexGrow={1} />
        <text fg="#ffffff">→</text>
      </box>

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
          <FileEditPreview
            hunks={currentFile.hunks}
            paddingLeft={0}
            splitView={useSplitView}
            filePath={fileName}
          />
        </box>
      </scrollbox>

      {/* Bottom navigation */}
      <box style={{ paddingTop: 1, paddingLeft: 1, paddingRight: 1, flexShrink: 0, flexDirection: "row", alignItems: "center" }}>
        <text fg="#ffffff">←</text>
        <text fg="#666666"> prev file</text>
        <box flexGrow={1} />
        <text fg="#ffffff">ctrl p</text>
        <text fg="#666666"> select file </text>
        <text fg="#666666">({validIndex + 1}/{parsedFiles.length})</text>
        <box flexGrow={1} />
        <text fg="#666666">next file </text>
        <text fg="#ffffff">→</text>
      </box>
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
                const fileName = getFileName(file);
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

        // Ensure currentFileIndex stays valid when files change
        React.useEffect(() => {
          if (parsedFiles && parsedFiles.length > 0) {
            const currentIndex = useDiffStore.getState().currentFileIndex;
            if (currentIndex >= parsedFiles.length) {
              useDiffStore.setState({ currentFileIndex: parsedFiles.length - 1 });
            }
          }
        }, [parsedFiles]);

        if (parsedFiles === null) {
          return (
            <box style={{ padding: 1, backgroundColor: BACKGROUND_COLOR }}>
              <text>Loading...</text>
            </box>
          );
        }

        if (parsedFiles.length === 0) {
          return (
            <box style={{ padding: 1, backgroundColor: BACKGROUND_COLOR }}>
              <text>No changes to display</text>
            </box>
          );
        }

        return <App parsedFiles={parsedFiles} />;
      }

      const { ErrorBoundary } = diffModule;

      const renderer = await createCliRenderer();
      createRoot(renderer).render(
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

      const renderer = await createCliRenderer();
      createRoot(renderer).render(
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
          <box style={{ padding: 1, flexDirection: "column", backgroundColor: BACKGROUND_COLOR }}>
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
                  backgroundColor: BACKGROUND_COLOR,
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

      const renderer = await createCliRenderer();
      createRoot(renderer).render(<PickApp files={files} branch={branch} />);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  });

cli
  .command("web [ref]", "Generate web preview of diff")
  .option("--staged", "Show staged changes")
  .option("--commit <ref>", "Show changes from a specific commit")
  .option("--width <width>", "Terminal width for rendering", { default: 120 })
  .option("--height <height>", "Terminal height for rendering", { default: 40 })
  .action(async (ref, options) => {
    const pty = await import("node-pty");
    const { spawn: bunSpawn } = await import("bun");

    const gitCommand = (() => {
      if (options.staged) return "git diff --cached --no-prefix";
      if (options.commit) return `git show ${options.commit} --no-prefix`;
      if (ref) return `git show ${ref} --no-prefix`;
      return "git add -N . && git diff --no-prefix";
    })();

    const width = parseInt(options.width) || 120;
    const height = parseInt(options.height) || 40;

    console.log("Capturing diff output...");

    // Get the git diff first
    const { stdout: gitDiff } = await execAsync(gitCommand, { encoding: "utf-8" });

    if (!gitDiff.trim()) {
      console.log("No changes to display");
      process.exit(0);
    }

    // Write diff to temp file
    const diffFile = join(tmpdir(), `critique-web-diff-${Date.now()}.patch`);
    fs.writeFileSync(diffFile, gitDiff);

    // Spawn the TUI in a PTY to capture ANSI output
    let ansiOutput = "";
    const ptyProcess = pty.spawn("bun", [
      process.argv[1]!, // path to cli.tsx
      "web-render",
      diffFile,
      "--width", String(width),
      "--height", String(height),
    ], {
      name: "xterm-256color",
      cols: width,
      rows: height,
      cwd: process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" },
    });

    ptyProcess.onData((data) => {
      ansiOutput += data;
    });

    await new Promise<void>((resolve) => {
      ptyProcess.onExit(() => {
        resolve();
      });
    });

    // Clean up temp file
    fs.unlinkSync(diffFile);

    if (!ansiOutput.trim()) {
      console.log("No output captured");
      process.exit(1);
    }

    console.log("Uploading to gist...");

    // Create gist using gh CLI
    const gistFile = join(tmpdir(), `critique-${Date.now()}.ansi`);
    fs.writeFileSync(gistFile, ansiOutput);

    try {
      const { stdout: gistUrl } = await execAsync(
        `gh gist create "${gistFile}" --public -d "Critique diff preview"`,
        { encoding: "utf-8" }
      );

      const gistId = gistUrl.trim().split("/").pop();
      fs.unlinkSync(gistFile);

      console.log(`Gist created: ${gistUrl.trim()}`);
      console.log(`\nStarting local server...`);
      console.log(`Open: http://localhost:3000?gist=${gistId}`);

      // Start vite dev server
      const viteProcess = bunSpawn(["bun", "run", "web"], {
        cwd: process.cwd(),
        stdio: ["inherit", "inherit", "inherit"],
      });

      process.on("SIGINT", () => {
        viteProcess.kill();
        process.exit(0);
      });

      await viteProcess.exited;
    } catch (error: any) {
      fs.unlinkSync(gistFile);
      console.error("Failed to create gist:", error.message);
      console.log("\nMake sure you have gh CLI installed and authenticated.");
      console.log("Run: gh auth login");
      process.exit(1);
    }
  });

// Internal command for web rendering (captures output to PTY)
cli
  .command("web-render <diffFile>", "Internal: Render diff for web capture", { allowUnknownOptions: true })
  .option("--width <width>", "Terminal width", { default: 120 })
  .option("--height <height>", "Terminal height", { default: 1000 })
  .action(async (diffFile: string, options) => {
    const width = parseInt(options.width) || 120;
    const height = parseInt(options.height) || 40;

    const [diffModule, { parsePatch }] = await Promise.all([
      import("./diff.tsx"),
      import("diff"),
    ]);

    const gitDiff = fs.readFileSync(diffFile, "utf-8");
    const files = parsePatch(gitDiff);

    const filteredFiles = files.filter((file) => {
      const fileName = getFileName(file);
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

    if (sortedFiles.length === 0) {
      console.log("No files to display");
      process.exit(0);
    }

    const { FileEditPreview, ErrorBoundary } = diffModule;

    // Override terminal size
    process.stdout.columns = width;
    process.stdout.rows = height;

    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: false,
    });

    // Track if we've rendered once
    let hasRendered = false;
    const originalRequestRender = renderer.root.requestRender.bind(renderer.root);
    renderer.root.requestRender = function() {
      if (hasRendered) return; // Skip subsequent renders
      hasRendered = true;
      originalRequestRender();
      // Exit after the first render completes
      setTimeout(() => {
        renderer.destroy();
        process.exit(0);
      }, 100);
    };

    // Static component - no hooks that cause re-renders
    function WebApp() {
      return (
        <box style={{ flexDirection: "column", height: "100%", padding: 1, backgroundColor: BACKGROUND_COLOR }}>
          {sortedFiles.map((file, idx) => {
            const fileName = getFileName(file);
            let additions = 0;
            let deletions = 0;
            file.hunks.forEach((hunk: any) => {
              hunk.lines.forEach((line: string) => {
                if (line.startsWith("+")) additions++;
                if (line.startsWith("-")) deletions++;
              });
            });

            return (
              <box key={idx} style={{ flexDirection: "column", marginBottom: 2 }}>
                <box style={{ paddingBottom: 1, paddingLeft: 1, paddingRight: 1, flexShrink: 0, flexDirection: "row", alignItems: "center" }}>
                  <text>{fileName.trim()}</text>
                  <text fg="#00ff00"> +{additions}</text>
                  <text fg="#ff0000">-{deletions}</text>
                </box>
                <FileEditPreview
                  hunks={file.hunks}
                  paddingLeft={0}
                  splitView={true}
                  filePath={fileName}
                />
              </box>
            );
          })}
        </box>
      );
    }

    createRoot(renderer).render(
      React.createElement(ErrorBoundary, null, React.createElement(WebApp))
    );
  });

cli.help();
cli.version("1.0.0");
// comment
cli.parse();
