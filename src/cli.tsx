#!/usr/bin/env bun
import { cac } from "cac";
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
import {
  createCliRenderer,
  MacOSScrollAccel,
} from "@opentui/core";
import fs from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { create } from "zustand";
import Dropdown from "./dropdown.tsx";
import { debounce } from "./utils.ts";
import { DiffView } from "./components/diff-view.tsx";
import { logger } from "./logger.ts";
import {
  buildGitCommand,
  getFileName,
  countChanges,
  getViewMode,
  processFiles,
  detectFiletype,
  IGNORED_FILES,
  type ParsedFile,
} from "./diff-utils.ts";

// Lazy-load watcher only when --watch is used
let watcherModule: typeof import("@parcel/watcher") | null = null;
async function getWatcher() {
  if (!watcherModule) {
    watcherModule = await import("@parcel/watcher");
  }
  return watcherModule;
}
import {
  getSyntaxTheme,
  getResolvedTheme,
  themeNames,
  defaultThemeName,
  rgbaToHex,
} from "./themes.ts";

// State persistence
const STATE_DIR = join(homedir(), ".critique");
const STATE_FILE = join(STATE_DIR, "state.json");

interface PersistedState {
  themeName?: string;
}

function loadPersistedState(): PersistedState {
  try {
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function savePersistedState(state: PersistedState): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // Ignore write errors
  }
}

const persistedState = loadPersistedState();

// Review mode handler
async function runReviewMode(gitCommand: string, agent: string) {
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  logger.info("Starting review mode", { gitCommand, agent });

  // Get the diff
  const { stdout: gitDiff } = await execAsync(gitCommand, {
    encoding: "utf-8",
  });

  logger.info("Got git diff", { length: gitDiff.length });

  if (!gitDiff.trim()) {
    console.log("No changes to review");
    process.exit(0);
  }

  // Lazy load review module
  const {
    parseHunksWithIds,
    hunksToContextXml,
    createAcpClient,
    sessionsToContextXml,
    compressSession,
  } = await import("./review/index.ts");
  const { ReviewApp } = await import("./review/review-app.tsx");

  // Parse hunks with IDs
  const hunks = await parseHunksWithIds(gitDiff);
  logger.info("Parsed hunks", { count: hunks.length });

  if (hunks.length === 0) {
    console.log("No hunks to review");
    process.exit(0);
  }

  console.log(`Found ${hunks.length} hunks to review`);
  console.log("Connecting to opencode ACP...");

  // Create temp file for YAML output
  const yamlPath = join(tmpdir(), `critique-review-${Date.now()}.yaml`);
  fs.writeFileSync(yamlPath, "");

  // Connect to ACP
  let acpClient: Awaited<ReturnType<typeof createAcpClient>> | null = null;
  let isGenerating = true;

  try {
    acpClient = await createAcpClient();

    // List sessions (will return empty for now since opencode doesn't support it)
    const cwd = process.cwd();
    const sessions = await acpClient.listSessions(cwd);

    // Build session context (empty for now)
    let sessionsContext = "";
    if (sessions.length > 0) {
      // Load and compress sessions
      const compressedSessions: Awaited<ReturnType<typeof compressSession>>[] = [];
      for (const sessionInfo of sessions.slice(0, 3)) {
        // Load max 3 recent sessions
        try {
          const content = await acpClient.loadSessionContent(sessionInfo.sessionId, cwd);
          compressedSessions.push(compressSession(content));
        } catch {
          // Skip sessions that fail to load
        }
      }
      sessionsContext = sessionsToContextXml(compressedSessions);
    }

    // Build hunks context
    const hunksContext = hunksToContextXml(hunks);

    console.log("Starting review analysis...");

    // Start the TUI
    const renderer = await createCliRenderer({
      onDestroy() {
        // Clean up ACP client and temp file
        if (acpClient) {
          acpClient.close();
        }
        try {
          fs.unlinkSync(yamlPath);
        } catch {
          // Ignore cleanup errors
        }
        process.exit(0);
      },
      exitOnCtrlC: true,
    });

    // Create the review session in background
    logger.info("Creating review session in background", { yamlPath });
    const reviewPromise = acpClient.createReviewSession(
      cwd,
      hunksContext,
      sessionsContext,
      yamlPath,
    ).then(() => {
      logger.info("Review generation completed");
      isGenerating = false;
    }).catch((error) => {
      logger.error("Review generation failed", error);
      console.error("Review generation failed:", error);
      isGenerating = false;
    });

    // Render the review app
    createRoot(renderer).render(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(ReviewApp, {
          hunks,
          yamlPath,
          themeName: persistedState.themeName ?? defaultThemeName,
          isGenerating,
        }),
      ),
    );

    // Wait for review to complete (TUI will handle user interaction)
    await reviewPromise;
  } catch (error) {
    logger.error("Review mode error", error);
    console.error("Review mode error:", error);
    if (acpClient) {
      await acpClient.close();
    }
    process.exit(1);
  }
}

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
    this.componentDidCatch = this.componentDidCatch.bind(this);
  }

  static getDerivedStateFromError(error: Error): {
    hasError: boolean;
    error: Error;
  } {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Error caught by boundary:", error);
    console.error("Component stack:", errorInfo.componentStack);
  }

  override render(): any {
    if (this.state.hasError && this.state.error) {
      return (
        <box style={{ flexDirection: "column", padding: 2 }}>
          <text fg="red">Error: {this.state.error.message}</text>
          <text fg="brightBlack">{this.state.error.stack}</text>
        </box>
      );
    }
    return this.props.children;
  }
}

const execAsync = promisify(exec);





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
  themeName: string;
}

const useDiffStore = create<DiffState>(() => ({
  currentFileIndex: 0,
  themeName: persistedState.themeName ?? defaultThemeName,
}));

// Subscribe to persist state changes
useDiffStore.subscribe((state) => {
  savePersistedState({ themeName: state.themeName });
});



interface AppProps {
  parsedFiles: ParsedFile[];
}

function App({ parsedFiles }: AppProps) {
  const { width: initialWidth } = useTerminalDimensions();
  const [width, setWidth] = React.useState(initialWidth);
  const [scrollAcceleration] = React.useState(() => new ScrollAcceleration());
  const currentFileIndex = useDiffStore((s) => s.currentFileIndex);
  const themeName = useDiffStore((s) => s.themeName);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [showThemePicker, setShowThemePicker] = React.useState(false);
  const [previewTheme, setPreviewTheme] = React.useState<string | null>(null);

  useOnResize(
    React.useCallback((newWidth: number) => {
      setWidth(newWidth);
    }, []),
  );
  const useSplitView = width >= 100;

  const renderer = useRenderer();

  useKeyboard((key) => {
    if (showDropdown || showThemePicker) {
      if (key.name === "escape") {
        setShowDropdown(false);
        setShowThemePicker(false);
        setPreviewTheme(null);
      }
      return;
    }

    if (key.name === "escape" || key.name === "q") {
      renderer.destroy();
      return;
    }

    if (key.name === "p" && key.ctrl) {
      setShowDropdown(true);
      return;
    }

    if (key.name === "t") {
      setShowThemePicker(true);
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
        currentFileIndex: Math.min(
          parsedFiles.length - 1,
          state.currentFileIndex + 1,
        ),
      }));
    }
  });

  // Ensure current index is valid
  const validIndex = Math.min(currentFileIndex, parsedFiles.length - 1);
  const currentFile = parsedFiles[validIndex];

  if (!currentFile) {
    return (
      <box
        style={{
          padding: 1,
          backgroundColor: getResolvedTheme(themeName).background,
        }}
      >
        <text>No files to display</text>
      </box>
    );
  }

  const fileName = getFileName(currentFile);
  const filetype = detectFiletype(fileName);

  // Use preview theme if hovering, otherwise use selected theme
  const activeTheme = previewTheme ?? themeName;
  const resolvedTheme = getResolvedTheme(activeTheme);
  const bgColor = resolvedTheme.background;

  // Calculate additions and deletions
  const { additions, deletions } = countChanges(currentFile.hunks);
  const viewMode = getViewMode(additions, deletions, width);

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

  const themeOptions = themeNames.map((name) => ({
    title: name,
    value: name,
  }));

  const handleThemeSelect = (value: string) => {
    useDiffStore.setState({ themeName: value });
    setShowThemePicker(false);
    setPreviewTheme(null);
  };

  const handleThemeFocus = (value: string) => {
    setPreviewTheme(value);
  };

  if (showThemePicker) {
    return (
      <box
        style={{
          flexDirection: "column",
          height: "100%",
          padding: 1,
          backgroundColor: bgColor,
        }}
      >
        <box style={{ flexShrink: 0, maxHeight: 15 }}>
          <Dropdown
            tooltip="Select theme"
            options={themeOptions}
            selectedValues={[themeName]}
            onChange={handleThemeSelect}
            onFocus={handleThemeFocus}
            placeholder="Search themes..."
            itemsPerPage={6}
            theme={resolvedTheme}
          />
        </box>
        <scrollbox
          style={{
            flexGrow: 1,
            rootOptions: {
              backgroundColor: bgColor,
              border: false,
            },
          }}
        >
          <DiffView
            diff={currentFile.rawDiff || ""}
            view={viewMode}
            filetype={filetype}
            themeName={activeTheme}
          />
        </scrollbox>
      </box>
    );
  }

  if (showDropdown) {
    return (
      <box
        style={{
          flexDirection: "column",
          height: "100%",
          padding: 1,
          backgroundColor: bgColor,
        }}
      >
        <box
          style={{
            flexDirection: "column",
            justifyContent: "center",
            flexGrow: 1,
          }}
        >
          <Dropdown
            tooltip="Select file"
            options={dropdownOptions}
            selectedValues={[String(validIndex)]}
            onChange={handleFileSelect}
            placeholder="Search files..."
            theme={resolvedTheme}
          />
        </box>
      </box>
    );
  }

  return (
    <box
      key={String(useSplitView)}
      style={{
        flexDirection: "column",
        height: "100%",
        padding: 1,
        backgroundColor: bgColor,
      }}
    >
      {/* Navigation header */}
      <box
        style={{
          paddingBottom: 1,
          paddingLeft: 1,
          paddingRight: 1,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <text fg="#ffffff">←</text>
        <box flexGrow={1} />
        <text onMouseDown={() => setShowDropdown(true)}>{fileName.trim()}</text>
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
            backgroundColor: bgColor,
            border: false,
          },
          scrollbarOptions: {
            showArrows: false,
            trackOptions: {
              foregroundColor: "#4a4a4a",
              backgroundColor: bgColor,
            },
          },
        }}
        focused
      >
        <DiffView
          diff={currentFile.rawDiff || ""}
          view={viewMode}
          filetype={filetype}
          themeName={activeTheme}
        />
      </scrollbox>

      {/* Bottom navigation */}
      <box
        style={{
          paddingTop: 1,
          paddingLeft: 1,
          paddingRight: 1,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <text fg="#ffffff">←</text>
        <text fg="#666666"> prev</text>
        <box flexGrow={1} />
        <text fg="#ffffff">q</text>
        <text fg="#666666"> quit  </text>
        <text fg="#ffffff">ctrl p</text>
        <text fg="#666666"> files </text>
        <text fg="#666666">
          ({validIndex + 1}/{parsedFiles.length})
        </text>
        <text fg="#666666">  </text>
        <text fg="#ffffff">t</text>
        <text fg="#666666"> theme</text>
        <box flexGrow={1} />
        <text fg="#666666">next </text>
        <text fg="#ffffff">→</text>
      </box>
    </box>
  );
}

cli
  .command(
    "[base] [head]",
    "Show diff for git references (defaults to unstaged changes)",
  )
  .option("--staged", "Show staged changes")
  .option("--commit <ref>", "Show changes from a specific commit")
  .option("--watch", "Watch for file changes and refresh diff")
  .option("--context <lines>", "Number of context lines (default: 3)")
  .option("--filter <pattern>", "Filter files by glob pattern (can be used multiple times)")
  .action(async (base, head, options) => {
    try {
      const gitCommand = buildGitCommand({
        staged: options.staged,
        commit: options.commit,
        base,
        head,
        context: options.context,
        filter: options.filter,
        positionalFilters: options['--'],
      });

      const shouldWatch = options.watch && !base && !head && !options.commit;

      // Parallelize diff module loading with renderer creation
      const [diffModule, renderer] = await Promise.all([
        import("diff"),
        createCliRenderer({
          onDestroy() {
            process.exit(0);
          },
          exitOnCtrlC: true,
        }),
      ]);
      const { parsePatch, formatPatch } = diffModule;

      function AppWithWatch() {
        const [parsedFiles, setParsedFiles] = React.useState<
          ParsedFile[] | null
        >(null);

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
              const processedFiles = processFiles(files, formatPatch);
              setParsedFiles(processedFiles);
            } catch (error) {
              setParsedFiles([]);
            }
          };

          fetchDiff();

          // Set up file watching only if --watch flag is used
          if (!shouldWatch) {
            return;
          }

          const cwd = process.cwd();

          const debouncedFetch = debounce(() => {
            fetchDiff();
          }, 200);

          let subscription:
            | Awaited<ReturnType<typeof import("@parcel/watcher").subscribe>>
            | undefined;

          // Lazy-load watcher module only when watching
          getWatcher().then((watcher) => {
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
              useDiffStore.setState({
                currentFileIndex: parsedFiles.length - 1,
              });
            }
          }
        }, [parsedFiles]);

        const defaultBg = getResolvedTheme(
          useDiffStore.getState().themeName,
        ).background;

        if (parsedFiles === null) {
          return (
            <box style={{ padding: 1, backgroundColor: defaultBg }}>
              <text>Loading...</text>
            </box>
          );
        }

        if (parsedFiles.length === 0) {
          return (
            <box style={{ padding: 1, backgroundColor: defaultBg }}>
              <text>No changes to display</text>
            </box>
          );
        }

        return <App parsedFiles={parsedFiles} />;
      }

      createRoot(renderer).render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(AppWithWatch),
        ),
      );
    } catch (error) {
      console.error("Error getting git diff:", error);
      process.exit(1);
    }
  });

cli
  .command("explain [base] [head]", "AI-powered diff explanation and review")
  .option("--agent <name>", "AI agent to use (default: opencode)", { default: "opencode" })
  .option("--staged", "Explain staged changes")
  .option("--commit <ref>", "Explain changes from a specific commit")
  .option("--context <lines>", "Number of context lines (default: 3)")
  .option("--filter <pattern>", "Filter files by glob pattern")
  .action(async (base, head, options) => {
    try {
      if (options.agent !== "opencode") {
        console.error(`Unknown agent: ${options.agent}. Supported: opencode`);
        process.exit(1);
      }

      const gitCommand = buildGitCommand({
        staged: options.staged,
        commit: options.commit,
        base,
        head,
        context: options.context,
        filter: options.filter,
        positionalFilters: options['--'],
      });

      await runReviewMode(gitCommand, options.agent);
    } catch (error) {
      console.error("Error running explain:", error);
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
      const localContent = fs.readFileSync(local, "utf-8");
      const remoteContent = fs.readFileSync(remote, "utf-8");
      const { structuredPatch, formatPatch } = await import("diff");

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

      // Add rawDiff for the diff component
      const patchWithRawDiff = {
        ...patch,
        rawDiff: formatPatch(patch),
      };

      const renderer = await createCliRenderer();
      createRoot(renderer).render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(App, { parsedFiles: [patchWithRawDiff] }),
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
              message: hasConflict
                ? `Applied ${value} with conflicts`
                : `Applied ${value}`,
              messageType: hasConflict ? "error" : "",
            }));
          }
        };

        const pickTheme = getResolvedTheme(defaultThemeName);

        return (
          <box
            style={{
              padding: 1,
              flexDirection: "column",
              backgroundColor: pickTheme.background,
            }}
          >
            <Dropdown
              tooltip={`Pick files from "${branch}"`}
              onChange={handleChange}
              selectedValues={Array.from(selectedFiles)}
              placeholder="Search files..."
              theme={pickTheme}
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
                  backgroundColor: pickTheme.background,
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

// Worker URL for uploading HTML previews
const WORKER_URL =
  process.env.CRITIQUE_WORKER_URL || "https://critique.work";

cli
  .command("web [base] [head]", "Generate web preview of diff")
  .option("--staged", "Show staged changes")
  .option("--commit <ref>", "Show changes from a specific commit")
  .option(
    "--cols <cols>",
    "Number of columns for desktop rendering",
    { default: 240 },
  )
  .option(
    "--mobile-cols <cols>",
    "Number of columns for mobile rendering",
    { default: 100 },
  )
  .option("--local", "Save local preview instead of uploading")
  .option("--open", "Open in browser after generating")
  .option("--context <lines>", "Number of context lines (default: 3)")
  .option("--theme <name>", "Theme to use for rendering")
  .option("--filter <pattern>", "Filter files by glob pattern (can be used multiple times)")
  .option("--title <title>", "HTML document title")
  .action(async (base, head, options) => {
    const pty = await import("@xmorse/bun-pty");
    const { ansiToHtmlDocument } = await import("./ansi-html.ts");

    const gitCommand = buildGitCommand({
      staged: options.staged,
      commit: options.commit,
      base,
      head,
      context: options.context,
      filter: options.filter,
      positionalFilters: options['--'],
    });

    const desktopCols = parseInt(options.cols) || 240;
    const mobileCols = parseInt(options.mobileCols) || 100;
    const customTheme = options.theme && themeNames.includes(options.theme);
    const themeName = customTheme ? options.theme : defaultThemeName;

    console.log("Capturing diff output...");

    // Get the git diff first
    const { stdout: gitDiff } = await execAsync(gitCommand, {
      encoding: "utf-8",
    });

    if (!gitDiff.trim()) {
      console.log("No changes to display");
      process.exit(0);
    }

    // Calculate required rows from diff content
    const { parsePatch } = await import("diff");
    const files = parsePatch(gitDiff);
    const baseRenderRows = files.reduce((sum, file) => {
      const diffLines = file.hunks.reduce((h, hunk) => h + hunk.lines.length, 0);
      return sum + diffLines + 5; // header + margin per file
    }, 100); // base padding

    // Write diff to temp file
    const diffFile = join(tmpdir(), `critique-web-diff-${Date.now()}.patch`);
    fs.writeFileSync(diffFile, gitDiff);

    // Helper function to capture PTY output for a given column width
    async function captureHtml(cols: number, renderRows: number): Promise<string> {
      let ansiOutput = "";
      const ptyProcess = pty.spawn(
        "bun",
        [
          process.argv[1]!, // path to cli.tsx
          "web-render",
          diffFile,
          "--cols",
          String(cols),
          "--rows",
          String(renderRows),
          "--theme",
          themeName,
        ],
        {
          name: "xterm-256color",
          cols: cols,
          rows: renderRows,
          cwd: process.cwd(),
          env: { ...process.env, TERM: "xterm-256color" } as Record<
            string,
            string
          >,
        },
      );

      ptyProcess.onData((data: string) => {
        ansiOutput += data;
      });

      await new Promise<void>((resolve) => {
        ptyProcess.onExit(() => {
          resolve();
        });
      });

      if (!ansiOutput.trim()) {
        throw new Error("No output captured");
      }

      // Strip terminal cleanup sequences that clear the screen
      const clearIdx = ansiOutput.lastIndexOf("\x1b[H\x1b[J");
      if (clearIdx > 0) {
        ansiOutput = ansiOutput.slice(0, clearIdx);
      }

      // Get theme colors for HTML output
      const theme = getResolvedTheme(themeName);
      const backgroundColor = rgbaToHex(theme.background);
      const textColor = rgbaToHex(theme.text);

      return ansiToHtmlDocument(ansiOutput, { cols, rows: renderRows, backgroundColor, textColor, autoTheme: !customTheme, title: options.title });
    }

    // Generate desktop and mobile versions in parallel
    // Mobile needs more rows since lines wrap more with fewer columns
    const mobileRenderRows = Math.ceil(baseRenderRows * (desktopCols / mobileCols));
    console.log("Generating desktop and mobile versions in parallel...");
    const [htmlDesktop, htmlMobile] = await Promise.all([
      captureHtml(desktopCols, baseRenderRows),
      captureHtml(mobileCols, mobileRenderRows),
    ]);

    // Clean up temp file
    fs.unlinkSync(diffFile);

    console.log("Converting to HTML...");

    if (options.local) {
      // Save locally
      const timestamp = Date.now();
      const htmlFileDesktop = join(tmpdir(), `critique-${timestamp}-desktop.html`);
      const htmlFileMobile = join(tmpdir(), `critique-${timestamp}-mobile.html`);
      fs.writeFileSync(htmlFileDesktop, htmlDesktop);
      fs.writeFileSync(htmlFileMobile, htmlMobile);
      console.log(`Saved desktop to: ${htmlFileDesktop}`);
      console.log(`Saved mobile to: ${htmlFileMobile}`);

      // Open in browser if requested
      if (options.open) {
        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        try {
          await execAsync(`${openCmd} "${htmlFileDesktop}"`);
        } catch {
          console.log("Could not open browser automatically");
        }
      }
      process.exit(0);
    }

    console.log("Uploading to worker...");

    try {
      const response = await fetch(`${WORKER_URL}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ html: htmlDesktop, htmlMobile }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${error}`);
      }

      const result = (await response.json()) as { id: string; url: string };

      console.log(`\nPreview URL: ${result.url}`);
      console.log(`(expires in 7 days)`);

      // Open in browser if requested
      if (options.open) {
        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        try {
          await execAsync(`${openCmd} "${result.url}"`);
        } catch {
          // Silent fail - user can copy URL
        }
      }
    } catch (error: any) {
      console.error("Failed to upload:", error.message);

      // Fallback to local file
      const htmlFile = join(tmpdir(), `critique-${Date.now()}.html`);
      fs.writeFileSync(htmlFile, htmlDesktop);
      console.log(`\nFallback: Saved locally to ${htmlFile}`);
      process.exit(1);
    }
  });

// Internal command for web rendering (captures output to PTY)
cli
  .command("web-render <diffFile>", "Internal: Render diff for web capture", {
    allowUnknownOptions: true,
  })
  .option("--cols <cols>", "Terminal columns", { default: 120 })
  .option("--rows <rows>", "Terminal rows", { default: 1000 })
  .option("--theme <name>", "Theme to use for rendering")
  .action(async (diffFile: string, options) => {
    const cols = parseInt(options.cols) || 120;
    const rows = parseInt(options.rows) || 1000;
    const themeName = options.theme && themeNames.includes(options.theme)
      ? options.theme
      : defaultThemeName;

    const { parsePatch, formatPatch } = await import("diff");

    const gitDiff = fs.readFileSync(diffFile, "utf-8");
    const files = parsePatch(gitDiff);
    const filesWithRawDiff = processFiles(files, formatPatch);

    if (filesWithRawDiff.length === 0) {
      console.log("No files to display");
      process.exit(0);
    }

    // Override terminal size (rows calculated by caller from diff content)
    process.stdout.columns = cols;
    process.stdout.rows = rows;

    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: false,
    });

    // Wait for syntax highlighting to complete (it's async)
    // Allow multiple renders, then exit after highlighting is ready
    let renderCount = 0;
    const originalRequestRender = renderer.root.requestRender.bind(
      renderer.root,
    );
    let exitTimeout: ReturnType<typeof setTimeout> | undefined;
    renderer.root.requestRender = function () {
      renderCount++;
      originalRequestRender();
      // Reset timeout on each render - exit 1s after last render
      // Tree-sitter highlighting is async and can take time for multiple files
      if (exitTimeout) clearTimeout(exitTimeout);
      exitTimeout = setTimeout(() => {
        renderer.destroy();
        process.exit(0);
      }, 1000);
    };

    // Static component - no hooks that cause re-renders
    const webTheme = getResolvedTheme(themeName);
    const webBg = webTheme.background;
    const webText = rgbaToHex(webTheme.text);
    const webAddedColor = rgbaToHex(webTheme.diffAddedBg);
    const webRemovedColor = rgbaToHex(webTheme.diffRemovedBg);
    function WebApp() {
      return (
        <box
          style={{
            flexDirection: "column",
            height: "100%",
            backgroundColor: webBg,
          }}
        >
          {filesWithRawDiff.map((file, idx) => {
            const fileName = getFileName(file);
            const filetype = detectFiletype(fileName);
            const { additions, deletions } = countChanges(file.hunks);
            // Use higher threshold (150) for web rendering vs TUI (100)
            const viewMode = getViewMode(additions, deletions, cols, 150);

            return (
              <box
                key={idx}
                style={{ flexDirection: "column", marginBottom: 2 }}
              >
                <box
                  style={{
                    paddingBottom: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    flexShrink: 0,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <text fg={webText}>{fileName.trim()}</text>
                  <text fg="#2d8a47"> +{additions}</text>
                  <text fg="#c53b53">-{deletions}</text>
                </box>
                <DiffView
                  diff={file.rawDiff || ""}
                  view={viewMode}
                  filetype={filetype}
                  themeName={themeName}
                />
              </box>
            );
          })}
        </box>
      );
    }

    createRoot(renderer).render(
      React.createElement(ErrorBoundary, null, React.createElement(WebApp)),
    );
  });

cli.help();
cli.version("1.0.0");
cli.parse();
