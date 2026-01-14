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
import { tmpdir } from "os";
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
import {
  useAppStore,
  persistedState,
  savePersistedState,
} from "./store.ts";

// Web options for review mode
interface ReviewWebOptions {
  web: boolean;
  open?: boolean;
}

// Review mode handler
async function runReviewMode(
  gitCommand: string,
  agent: string,
  sessionIds?: string[],
  webOptions?: ReviewWebOptions
) {
  const { tmpdir } = await import("os");
  const { join } = await import("path");
  const pc = await import("picocolors");
  const clack = await import("@clack/prompts");

  logger.info("Starting review mode", { gitCommand, agent });

  // Intro
  clack.intro("critique review");

  // Get the diff
  const { stdout: gitDiff } = await execAsync(gitCommand, {
    encoding: "utf-8",
  });

  logger.info("Got git diff", { length: gitDiff.length });

  if (!gitDiff.trim()) {
    clack.log.warn("No changes to review");
    clack.outro("");
    process.exit(0);
  }

  // Lazy load review module
  const {
    parseHunksWithIds,
    hunksToContextXml,
    createAcpClient,
    sessionsToContextXml,
    compressSession,
    waitForFirstValidGroup,
  } = await import("./review/index.ts");
  const { ReviewApp } = await import("./review/review-app.tsx");

  // Parse hunks with IDs
  const hunks = await parseHunksWithIds(gitDiff);
  logger.info("Parsed hunks", { count: hunks.length });

  if (hunks.length === 0) {
    clack.log.warn("No hunks to review");
    clack.outro("");
    process.exit(0);
  }

  clack.log.step(`Found ${hunks.length} hunk${hunks.length === 1 ? "" : "s"} to review`);

  // Create temp file for YAML output
  const yamlPath = join(tmpdir(), `critique-review-${Date.now()}.yaml`);
  fs.writeFileSync(yamlPath, "");

  // Connect to ACP
  let acpClient: ReturnType<typeof createAcpClient> | null = null;
  let reviewSessionId: string | null = null;

  // Streaming state for taskLog
  let analysisLog: ReturnType<typeof clack.taskLog> | null = null;
  let analysisSpinner: ReturnType<typeof clack.spinner> | null = null;
  let toolSpinner: ReturnType<typeof clack.spinner> | null = null;
  let activeToolCalls = new Set<string>();
  let lastToolCount = 0;
  let lastThinking = false;
  let currentMessage = "";
  const seenToolCalls = new Set<string>();

  const ensureAnalysisLog = () => {
    if (!analysisLog) {
      analysisSpinner?.stop("Analysis started");
      analysisSpinner = null;
      analysisLog = clack.taskLog({ title: "Analyzing diff..." });
    }
    return analysisLog;
  };

  const updateToolSpinner = (count: number) => {
    if (count <= 0) {
      if (toolSpinner) {
        toolSpinner.stop("Tools finished");
        toolSpinner = null;
      }
      lastToolCount = 0;
      return;
    }
    if (!toolSpinner) {
      toolSpinner = clack.spinner();
      toolSpinner.start(`Running ${count} tool${count === 1 ? "" : "s"}...`);
    } else if (count !== lastToolCount) {
      toolSpinner.message(`Running ${count} tool${count === 1 ? "" : "s"}...`);
    }
    lastToolCount = count;
  };

  const printNotification = (notification: import("@agentclientprotocol/sdk").SessionNotification) => {
    const log = ensureAnalysisLog();
    
    const update = notification.update;
    
    if (update.sessionUpdate === "agent_thought_chunk") {
      if (!lastThinking) {
        log.message(pc.default.gray("thinking..."));
        lastThinking = true;
      }
      if (currentMessage) {
        log.message(pc.default.dim(currentMessage.split("\n")[0]));
        currentMessage = "";
      }
      return;
    }

    if (update.sessionUpdate === "agent_message_chunk") {
      lastThinking = false;
      const content = (update as { content?: { text?: string } }).content;
      if (content?.text) currentMessage += content.text;
      return;
    }

    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      lastThinking = false;
      if (currentMessage) {
        log.message(pc.default.dim(currentMessage.split("\n")[0]));
        currentMessage = "";
      }

      const tool = update as {
        toolCallId?: string;
        kind?: string;
        title?: string;
        locations?: { path: string }[];
        additions?: number;
        deletions?: number;
        rawInput?: Record<string, unknown>;
        status?: string;
      };

      const toolId = tool.toolCallId || "";
      const kind = tool.kind || "";
      const kindLower = kind.toLowerCase();
      const isEdit = kindLower.includes("edit") || kindLower.includes("write");
      const isWrite = kindLower.includes("write");
      const isRead = kindLower.includes("read");
      const status = (tool.status || "").toLowerCase();
      const isActiveStatus = status === "pending" || status === "in_progress";
      const isDoneStatus = status === "completed" || status === "error" || status === "cancelled";
      
      // Get file from locations or rawInput.filePath
      let file = tool.locations?.[0]?.path?.split("/").pop() || "";
      if (!file && tool.rawInput) {
        const inputPath = (tool.rawInput.filePath || tool.rawInput.path || tool.rawInput.file) as string | undefined;
        if (inputPath) file = inputPath.split("/").pop() || "";
      }

      if (toolId) {
        if (isActiveStatus) {
          activeToolCalls.add(toolId);
        } else if (isDoneStatus) {
          activeToolCalls.delete(toolId);
        }
        updateToolSpinner(activeToolCalls.size);
      }
      
      // Skip if we've already shown this tool call with file info
      // (first notification often has empty locations, update has the file)
      if (seenToolCalls.has(toolId)) {
        // Already shown with file info, skip
        return;
      }
      
      // For read/write/edit, wait until we have file info before showing
      if ((isRead || isWrite || isEdit) && !file) {
        return;
      }
      
      seenToolCalls.add(toolId);
      
      let line: string;
      if (isWrite && file) {
        line = `write ${file}`;
      } else if (isEdit && file) {
        line = `edit  ${file}`;
        if (tool.additions !== undefined || tool.deletions !== undefined) {
          line += ` (+${tool.additions || 0}-${tool.deletions || 0})`;
        }
      } else if (isRead && file) {
        line = `read  ${file}`;
      } else {
        line = (tool.title || kind || "tool") + (file ? ` ${file}` : "");
      }

      log.message((isEdit ? pc.default.green : pc.default.gray)(line));
    }
  };

  try {
    // Create client and start connection in background (non-blocking)
    // This lets us list sessions while ACP server is starting
    acpClient = createAcpClient(agent as "opencode" | "claude", (notification) => {
      if (reviewSessionId && notification.sessionId === reviewSessionId) {
        printNotification(notification);
      }
    }, true); // startConnectionNow = true

    const cwd = process.cwd();
    // listSessions doesn't need ACP connection, so this runs immediately
    const sessions = await acpClient.listSessions(cwd);

    // Build session context
    let sessionsContext = "";
    let selectedSessionIds: string[] = [];

    if (sessions.length > 0) {
      // If session IDs provided via --session, use those
      if (sessionIds && sessionIds.length > 0) {
        selectedSessionIds = sessionIds;
        clack.log.info(`Using ${selectedSessionIds.length} specified session(s) for context`);
      } else {
        // Show multiselect prompt to pick sessions
        const formatTimeAgo = (timestamp: number) => {
          const seconds = Math.floor((Date.now() - timestamp) / 1000);
          if (seconds < 60) return "just now";
          const minutes = Math.floor(seconds / 60);
          if (minutes < 60) return `${minutes}m ago`;
          const hours = Math.floor(minutes / 60);
          if (hours < 24) return `${hours}h ago`;
          const days = Math.floor(hours / 24);
          return `${days}d ago`;
        };

        // Filter out critique-generated sessions and ACP sessions, limit to first 10
        const filteredSessions = sessions
          .filter((s) => {
            // Filter by _meta if the agent supports it
            if (s._meta?.critique === true) return false
            // Filter by title patterns
            const title = s.title?.toLowerCase() || ""
            if (title.includes("acp session")) return false
            if (title.includes("reviewing a git diff")) return false
            if (title.includes("review a git diff")) return false
            return true
          })
          .slice(0, 10);

        if (filteredSessions.length === 0) {
          clack.log.info("No sessions available for context");
        }

        const selected = filteredSessions.length > 0
          ? await clack.multiselect({
              message: "Select sessions to include as context (space to toggle, enter to confirm)",
              options: filteredSessions.map((s) => ({
                value: s.sessionId,
                label: s.title || `Session ${s.sessionId.slice(0, 8)}`,
                hint: s.updatedAt ? formatTimeAgo(s.updatedAt) : undefined,
              })),
              required: false,
            })
          : [];

        if (clack.isCancel(selected)) {
          clack.cancel("Operation cancelled");
          process.exit(0);
        }

        selectedSessionIds = selected as string[];
        if (selectedSessionIds.length > 0) {
          clack.log.info(`Selected ${selectedSessionIds.length} session(s) for context`);
        } else {
          clack.log.info("No sessions selected, proceeding without context");
        }
      }

      // Load selected sessions
      if (selectedSessionIds.length > 0) {
        const loadSpinner = clack.spinner();
        loadSpinner.start(`Loading ${selectedSessionIds.length} session${selectedSessionIds.length === 1 ? "" : "s"}...`);
        
        const compressedSessions: Awaited<ReturnType<typeof compressSession>>[] = [];
        const sessionsToLoad = sessions.filter((s) => selectedSessionIds.includes(s.sessionId));
        
        for (const sessionInfo of sessionsToLoad) {
          try {
            const content = await acpClient.loadSessionContent(sessionInfo.sessionId, cwd);
            compressedSessions.push(compressSession(content));
          } catch {
            // Skip sessions that fail to load
          }
        }
        sessionsContext = sessionsToContextXml(compressedSessions);
        loadSpinner.stop(`Loaded ${compressedSessions.length} session${compressedSessions.length === 1 ? "" : "s"}`);
      }
    }

    const hunksContext = hunksToContextXml(hunks);
    
    analysisSpinner = clack.spinner();
    analysisSpinner.start("Analyzing diff...");

    // Start the review session (don't await - let it run in background)
    logger.info("Creating review session", { yamlPath });
    const sessionPromise = acpClient.createReviewSession(
      cwd,
      hunksContext,
      sessionsContext,
      yamlPath,
      (sessionId) => {
        reviewSessionId = sessionId;
        logger.info("Review session started", { sessionId });
      },
    );

    // Web mode: wait for full generation, then render to HTML
    if (webOptions?.web) {
      // Wait for generation to complete
      try {
        await sessionPromise;
        const log = ensureAnalysisLog();
        if (currentMessage) {
          log.message(pc.default.dim(currentMessage.split("\n")[0]));
        }
        updateToolSpinner(0);
        log.success("Analysis complete");
        logger.info("Review generation completed, generating web preview");
      } catch (error) {
        const log = ensureAnalysisLog();
        updateToolSpinner(0);
        log.error("Analysis failed");
        logger.error("Review session error", error);
        clack.log.error(`Review generation failed: ${error}`);
        if (acpClient) await acpClient.close();
        try { fs.unlinkSync(yamlPath); } catch (e) { logger.debug("Failed to cleanup yaml file", { error: e }); }
        process.exit(1);
      }

      // Import web utilities
      const {
        captureResponsiveHtml,
        uploadHtml,
        openInBrowser,
        writeTempFile,
        cleanupTempFile,
      } = await import("./web-utils.ts");

      // Write hunks to temp file for the render command
      const hunksFile = writeTempFile(JSON.stringify(hunks), "critique-hunks", ".json");
      const themeName = persistedState.themeName ?? defaultThemeName;

      // Calculate rows needed based on hunks
      const totalLines = hunks.reduce((sum, h) => sum + h.lines.length, 0);
      const baseRows = Math.max(200, totalLines * 2 + 100);

      const renderCommand = [
        process.argv[1]!,
        "review-web-render",
        yamlPath,
        hunksFile,
        "--theme",
        themeName,
      ];

      const webSpinner = clack.spinner();
      webSpinner.start("Generating web preview...");
      
      try {
        const { htmlDesktop, htmlMobile } = await captureResponsiveHtml(
          renderCommand,
          { desktopCols: 240, mobileCols: 100, baseRows, themeName }
        );

        // Clean up temp files
        cleanupTempFile(hunksFile);
        cleanupTempFile(yamlPath);
        if (acpClient) await acpClient.close();

        webSpinner.message("Uploading...");
        const result = await uploadHtml(htmlDesktop, htmlMobile);
        webSpinner.stop("Uploaded");
        
        clack.log.success(`Preview URL: ${result.url}`);
        clack.log.info("(expires in 7 days)");
        clack.outro("");

        if (webOptions.open) {
          await openInBrowser(result.url);
        }
        process.exit(0);
      } catch (error: any) {
        webSpinner.stop("Failed");
        cleanupTempFile(hunksFile);
        cleanupTempFile(yamlPath);
        if (acpClient) await acpClient.close();
        clack.log.error(`Failed to generate web preview: ${error.message}`);
        clack.outro("");
        process.exit(1);
      }
    }

    // TUI mode: wait for first valid group, then start interactive UI
    await waitForFirstValidGroup(yamlPath);
    const log = ensureAnalysisLog();
    if (currentMessage) {
      log.message(pc.default.dim(currentMessage.split("\n")[0]));
    }
    updateToolSpinner(0);
    log.success("Analysis complete");
    logger.info("First valid group appeared, starting TUI");

    // Start TUI immediately with isGenerating: true
    const renderer = await createCliRenderer({
      onDestroy() {
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

    const root = createRoot(renderer);
    
    // Helper to render with current isGenerating state
    const renderApp = (isGenerating: boolean) => {
      root.render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(ReviewApp, {
            hunks,
            yamlPath,
            isGenerating,
          }),
        ),
      );
    };

    // Start with isGenerating: true
    renderApp(true);

    // When session completes, re-render with isGenerating: false
    sessionPromise
      .then(() => {
        logger.info("Review generation completed");
        renderApp(false);
      })
      .catch((error) => {
        logger.error("Review session error", error);
        renderApp(false);
      });
  } catch (error) {
    logger.error("Review mode error", error);
    const log = ensureAnalysisLog();
    updateToolSpinner(0);
    log.error("Analysis failed");
    clack.log.error(`Review mode error: ${error}`);
    clack.outro("");
    if (acpClient) {
      await acpClient.close();
    }
    process.exit(1);
  }
}

// Error boundary component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  declare props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.componentDidCatch = this.componentDidCatch.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Error caught by boundary:", error);
    console.error("Component stack:", errorInfo.componentStack);
  }

  render(): React.ReactNode {
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

interface AppProps {
  parsedFiles: ParsedFile[];
}

function App({ parsedFiles }: AppProps) {
  const { width: initialWidth } = useTerminalDimensions();
  const [width, setWidth] = React.useState(initialWidth);
  const [scrollAcceleration] = React.useState(() => new ScrollAcceleration());
  const currentFileIndex = useAppStore((s) => s.currentFileIndex);
  const themeName = useAppStore((s) => s.themeName);
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
      useAppStore.setState((state) => ({
        currentFileIndex: Math.max(0, state.currentFileIndex - 1),
      }));
    }
    if (key.name === "right") {
      useAppStore.setState((state) => ({
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
    useAppStore.setState({ currentFileIndex: index });
    setShowDropdown(false);
  };

  const themeOptions = themeNames.map((name) => ({
    title: name,
    value: name,
  }));

  const handleThemeSelect = (value: string) => {
    useAppStore.setState({ themeName: value });
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
            contentOptions: {
              minHeight: 0,
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
          contentOptions: {
            minHeight: 0,
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
            const currentIndex = useAppStore.getState().currentFileIndex;
            if (currentIndex >= parsedFiles.length) {
              useAppStore.setState({
                currentFileIndex: parsedFiles.length - 1,
              });
            }
          }
        }, [parsedFiles]);

        const defaultBg = getResolvedTheme(
          useAppStore.getState().themeName,
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
  .command("review [base] [head]", "AI-powered diff review")
  .option("--agent <name>", "AI agent to use (default: opencode)", { default: "opencode" })
  .option("--staged", "Review staged changes")
  .option("--commit <ref>", "Review changes from a specific commit")
  .option("--context <lines>", "Number of context lines (default: 3)")
  .option("--filter <pattern>", "Filter files by glob pattern")
  .option("--session <id>", "Session ID(s) to include as context (can be repeated)")
  .option("--web", "Generate web preview instead of TUI")
  .option("--open", "Open web preview in browser (with --web)")
  .action(async (base, head, options) => {
    try {
      if (options.agent !== "opencode" && options.agent !== "claude") {
        console.error(`Unknown agent: ${options.agent}. Supported: opencode, claude`);
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

      // Normalize session option to array (cac returns string for single, array for multiple)
      const sessionIds = options.session
        ? Array.isArray(options.session) ? options.session : [options.session]
        : undefined;

      const webOptions = options.web ? { web: true, open: options.open } : undefined;
      await runReviewMode(gitCommand, options.agent, sessionIds, webOptions);
    } catch (error) {
      console.error("Error running review:", error);
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
                Array.from(state.appliedFiles.entries()).filter(([k]) => k !== value),
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
    const {
      captureResponsiveHtml,
      uploadHtml,
      openInBrowser,
      writeTempFile,
      cleanupTempFile,
    } = await import("./web-utils.ts");

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
    const themeName = options.theme && themeNames.includes(options.theme)
      ? options.theme
      : defaultThemeName;

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
    const baseRows = files.reduce((sum, file) => {
      const diffLines = file.hunks.reduce((h, hunk) => h + hunk.lines.length, 0);
      return sum + diffLines + 5; // header + margin per file
    }, 100); // base padding

    // Write diff to temp file
    const diffFile = writeTempFile(gitDiff, "critique-web-diff", ".patch");

    // Build render command
    const renderCommand = [
      process.argv[1]!, // path to cli.tsx
      "web-render",
      diffFile,
      "--theme",
      themeName,
    ];

    console.log("Converting to HTML...");

    try {
      const { htmlDesktop, htmlMobile } = await captureResponsiveHtml(
        renderCommand,
        { desktopCols, mobileCols, baseRows, themeName, title: options.title }
      );

      // Clean up temp file
      cleanupTempFile(diffFile);

      if (options.local) {
        // Save locally
        const desktopFile = writeTempFile(htmlDesktop, "critique-desktop", ".html");
        const mobileFile = writeTempFile(htmlMobile, "critique-mobile", ".html");
        console.log(`Saved desktop to: ${desktopFile}`);
        console.log(`Saved mobile to: ${mobileFile}`);

        if (options.open) {
          await openInBrowser(desktopFile);
        }
        process.exit(0);
      }

      console.log("Uploading to worker...");

      const result = await uploadHtml(htmlDesktop, htmlMobile);
      console.log(`\nPreview URL: ${result.url}`);
      console.log(`(expires in 7 days)`);

      if (options.open) {
        await openInBrowser(result.url);
      }
    } catch (error: any) {
      cleanupTempFile(diffFile);
      console.error("Failed to generate web preview:", error.message);

      // Fallback to local file on upload failure
      if (!options.local) {
        const htmlFile = writeTempFile("", "critique-fallback", ".html");
        console.log(`\nFallback: Saved locally to ${htmlFile}`);
      }
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

// Internal command for review web rendering (captures output to PTY)
cli
  .command("review-web-render <yamlPath> <hunksFile>", "Internal: Render review for web capture", {
    allowUnknownOptions: true,
  })
  .option("--cols <cols>", "Terminal columns", { default: 240 })
  .option("--rows <rows>", "Terminal rows", { default: 500 })
  .option("--theme <name>", "Theme to use for rendering")
  .action(async (yamlPath: string, hunksFile: string, options) => {
    const cols = parseInt(options.cols) || 240;
    const rows = parseInt(options.rows) || 500;
    const themeName = options.theme && themeNames.includes(options.theme)
      ? options.theme
      : defaultThemeName;

    // Load hunks and review data
    const hunks = JSON.parse(fs.readFileSync(hunksFile, "utf-8"));
    const { readReviewYaml } = await import("./review/yaml-watcher.ts");
    const reviewData = readReviewYaml(yamlPath);

    if (!reviewData) {
      console.log("No review data found");
      process.exit(1);
    }

    // Override terminal size
    process.stdout.columns = cols;
    process.stdout.rows = rows;

    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useAlternateScreen: false,
    });

    // Wait for syntax highlighting to complete
    let exitTimeout: ReturnType<typeof setTimeout> | undefined;
    const originalRequestRender = renderer.root.requestRender.bind(renderer.root);
    renderer.root.requestRender = function () {
      originalRequestRender();
      if (exitTimeout) clearTimeout(exitTimeout);
      exitTimeout = setTimeout(() => {
        renderer.destroy();
        process.exit(0);
      }, 1000);
    };

    // Import ReviewAppView for static rendering
    const { ReviewAppView } = await import("./review/review-app.tsx");

    function ReviewWebApp() {
      return React.createElement(ReviewAppView, {
        hunks,
        reviewData,
        isGenerating: false,
        themeName,
        width: cols,
        showFooter: false, // hide keyboard shortcuts in web mode
      });
    }

    createRoot(renderer).render(
      React.createElement(ErrorBoundary, null, React.createElement(ReviewWebApp)),
    );
  });

cli.help();
cli.version("1.0.0");
cli.parse();
