#!/usr/bin/env bun
// CLI entrypoint for the critique diff viewer.
// Provides TUI diff viewing, AI-powered review generation, and web preview upload.
// Commands: default (diff), review (AI analysis), web (HTML upload), pick (cherry-pick files).

import { cac } from "cac";
import {
  createRoot,
  flushSync,
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
  ScrollBoxRenderable,
  BoxRenderable,
} from "@opentui/core";
import fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { create } from "zustand";
import Dropdown from "./dropdown.tsx";
import { debounce } from "./utils.ts";
import { DiffView, DirectoryTreeView } from "./components/index.ts";
import { logger } from "./logger.ts";
import {
  buildGitCommand,
  getFileName,
  getFileStatus,
  countChanges,
  getViewMode,
  processFiles,
  detectFiletype,
  stripSubmoduleHeaders,
  IGNORED_FILES,
  type ParsedFile,
} from "./diff-utils.ts";
import type { TreeFileInfo } from "./directory-tree.ts";

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
} from "./store.ts";

// Web options for review mode
interface ReviewWebOptions {
  web: boolean;
  open?: boolean;
}

// Review mode options
interface ReviewModeOptions {
  sessionIds?: string[];
  webOptions?: ReviewWebOptions;
  model?: string;
  json?: boolean;
}

// Review mode handler
async function runReviewMode(
  gitCommand: string,
  agent: string,
  options: ReviewModeOptions = {}
) {
  const { sessionIds, webOptions, model, json } = options;
  const { tmpdir } = await import("os");
  const { join } = await import("path");
  const pc = await import("picocolors");
  const clack = await import("@clack/prompts");

  // When --json is set, redirect clack output to stderr
  const out = json ? { output: process.stderr } : {};

  logger.info("Starting review mode", { gitCommand, agent });

  // Intro
  clack.intro("critique review", out);

  // Get the diff
  const { stdout: gitDiff } = await execAsync(gitCommand, {
    encoding: "utf-8",
  });

  logger.info("Got git diff", { length: gitDiff.length });

  if (!gitDiff.trim()) {
    clack.log.warn("No changes to review", out);
    clack.outro("", out);
    if (json) console.log(JSON.stringify({ error: "No changes to review" }));
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
    readReviewYaml,
    saveReview,
  } = await import("./review/index.ts");
  const { ReviewApp } = await import("./review/review-app.tsx");
  type StoredReview = import("./review/index.ts").StoredReview;

  // Parse hunks with IDs
  const hunks = await parseHunksWithIds(gitDiff);
  logger.info("Parsed hunks", { count: hunks.length });

  if (hunks.length === 0) {
    clack.log.warn("No hunks to review", out);
    clack.outro("", out);
    if (json) console.log(JSON.stringify({ error: "No hunks to review" }));
    process.exit(0);
  }

  clack.log.step(`Found ${hunks.length} hunk${hunks.length === 1 ? "" : "s"} to review`, out);

  // Create temp file for YAML output
  const yamlPath = join(tmpdir(), `critique-review-${Date.now()}.yaml`);
  fs.writeFileSync(yamlPath, "");

  // Connect to ACP
  let acpClient: ReturnType<typeof createAcpClient> | null = null;
  let reviewSessionId: string | null = null;

  // Pending review - tracked in memory, saved on exit or completion
  let pendingReview: StoredReview | null = null;
  let reviewSaved = false;

  // Save pending review (called on exit or completion)
  const savePendingReview = (status: "in_progress" | "completed") => {
    if (reviewSaved || !pendingReview) return;
    
    // Update with latest YAML content
    const reviewYaml = readReviewYaml(yamlPath);
    if (reviewYaml) {
      pendingReview.reviewYaml = reviewYaml;
      pendingReview.title = reviewYaml.title || "Untitled review";
    }
    
    // Only save if there's actual content (at least one hunk group)
    if (pendingReview.reviewYaml.hunks.length === 0) {
      logger.debug("No content to save, skipping");
      return;
    }
    
    pendingReview.status = status;
    pendingReview.updatedAt = Date.now();
    
    try {
      saveReview(pendingReview);
      reviewSaved = true;
      logger.info("Review saved to history", { status, id: pendingReview.id });
    } catch (e) {
      logger.debug("Failed to save review to history", { error: e });
    }
  };

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
      analysisLog = clack.taskLog({ title: "Analyzing diff...", ...out });
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
      toolSpinner = clack.spinner(out);
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
        clack.log.info(`Using ${selectedSessionIds.length} specified session(s) for context`, out);
      } else {
        // Helper to format time ago
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

        // Filter out critique-generated sessions and ACP sessions, limit to first 25
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
          .slice(0, 25);

        // Non-TTY mode or --json: log available sessions for agents to use with --session
        if (!process.stdin.isTTY || json) {
          if (filteredSessions.length > 0) {
            clack.log.info("Available sessions for context:", out);
            for (const s of filteredSessions) {
              const timeAgo = s.updatedAt ? formatTimeAgo(s.updatedAt) : "";
              const title = s.title || `Session ${s.sessionId.slice(0, 8)}`;
              clack.log.info(`  ${s.sessionId}  ${title}  ${timeAgo}`, out);
            }
            clack.log.info("To include relevant sessions, re-run with: --session <id> (can be repeated)", out);
          } else {
            clack.log.info("No sessions available for context", out);
          }
          clack.log.info("Proceeding without session context", out);
        } else {
          // TTY mode: show interactive multiselect prompt
          if (filteredSessions.length === 0) {
            clack.log.info("No sessions available for context", out);
          }

          const selected = filteredSessions.length > 0
            ? await clack.multiselect({
                message: "Select sessions to include as context (space to toggle, enter to confirm)",
                options: filteredSessions.map((s) => {
                  const title = s.title || `Session ${s.sessionId.slice(0, 8)}`;
                  const timeAgo = s.updatedAt ? formatTimeAgo(s.updatedAt) : "";
                  // Include time in label to prevent layout shift (hints only show on focus)
                  const label = timeAgo ? `${title}  ${pc.default.dim(`(${timeAgo})`)}` : title;
                  return { value: s.sessionId, label };
                }),
                required: false,
                ...out,
              })
            : [];

          if (clack.isCancel(selected)) {
            clack.cancel("Operation cancelled", out);
            process.exit(0);
          }

          selectedSessionIds = selected as string[];
          if (selectedSessionIds.length > 0) {
            clack.log.info(`Selected ${selectedSessionIds.length} session(s) for context`, out);
          } else {
            clack.log.info("No sessions selected, proceeding without context", out);
          }
        }
      }

      // Load selected sessions
      if (selectedSessionIds.length > 0) {
        const loadSpinner = clack.spinner(out);
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
    
    analysisSpinner = clack.spinner(out);
    analysisSpinner.start("Analyzing diff...");

    // Start the review session (don't await - let it run in background)
    logger.info("Creating review session", { yamlPath, model });
    const sessionPromise = acpClient.createReviewSession(
      cwd,
      hunksContext,
      sessionsContext,
      yamlPath,
      (sessionId) => {
        reviewSessionId = sessionId;
        logger.info("Review session started", { sessionId });
        
        // Initialize pending review with ACP session ID
        const now = Date.now();
        pendingReview = {
          id: sessionId,
          createdAt: now,
          updatedAt: now,
          status: "in_progress",
          cwd,
          agent: agent as "opencode" | "claude",
          title: "Untitled review",
          hunks,
          reviewYaml: { hunks: [] },
        };
      },
      { model },
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

        // Save the review as completed
        savePendingReview("completed");
      } catch (error) {
        // Stop any active spinners
        if (analysisSpinner) {
          analysisSpinner.stop("Failed");
          analysisSpinner = null;
        }
        updateToolSpinner(0);
        
        logger.error("Review session error", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        clack.log.error(errorMessage, out);
        clack.outro("", out);
        
        // Save partial progress
        savePendingReview("in_progress");
        if (acpClient) await acpClient.close();
        try { fs.unlinkSync(yamlPath); } catch (e) { logger.debug("Failed to cleanup yaml file", { error: e }); }
        if (json) console.log(JSON.stringify({ error: errorMessage }));
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
      // For web, always use default theme (with auto dark/light inversion) unless explicitly overridden
      const themeName = defaultThemeName;

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

      const webSpinner = clack.spinner(out);
      webSpinner.start("Generating web preview...");
      
      try {
        const { htmlDesktop, htmlMobile } = await captureResponsiveHtml(
          renderCommand,
          { desktopCols: 230, mobileCols: 100, baseRows, themeName }
        );

        // Clean up temp files
        cleanupTempFile(hunksFile);
        cleanupTempFile(yamlPath);
        if (acpClient) await acpClient.close();

        webSpinner.message("Uploading...");
        const result = await uploadHtml(htmlDesktop, htmlMobile);
        webSpinner.stop("Uploaded");
        
        clack.log.success(`Preview URL: ${result.url}`, out);
        clack.log.info("(expires in 7 days)", out);
        clack.outro("", out);
        if (json) {
          console.log(JSON.stringify({ url: result.url, id: result.id }));
        }

        if (webOptions.open) {
          await openInBrowser(result.url);
        }
        process.exit(0);
      } catch (error: any) {
        webSpinner.stop("Failed");
        cleanupTempFile(hunksFile);
        cleanupTempFile(yamlPath);
        if (acpClient) await acpClient.close();
        clack.log.error(`Failed to generate web preview: ${error.message}`, out);
        clack.outro("", out);
        if (json) console.log(JSON.stringify({ error: error.message }));
        process.exit(1);
      }
    }

    // TUI mode: wait for first valid group, then start interactive UI
    // Race against session errors (e.g., invalid model) to fail fast
    await Promise.race([
      waitForFirstValidGroup(yamlPath),
      // If session fails early (e.g., invalid model), reject immediately
      sessionPromise.then(
        () => new Promise(() => {}), // Never resolve if successful (let waitForFirstValidGroup win)
        (error) => Promise.reject(error), // Reject immediately on error
      ),
    ]);
    
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
        // Save review before exiting (will be in_progress if not completed)
        savePendingReview("in_progress");
        
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
        <ErrorBoundary>
          <ReviewApp hunks={hunks} yamlPath={yamlPath} isGenerating={isGenerating} />
        </ErrorBoundary>
      );
    };

    // Start with isGenerating: true
    renderApp(true);

    // When session completes, re-render with isGenerating: false and save to history
    sessionPromise
      .then(() => {
        logger.info("Review generation completed");
        renderApp(false);

        // Save the review as completed
        savePendingReview("completed");
      })
      .catch((error) => {
        logger.error("Review session error", error);
        renderApp(false);
        // Still save as in_progress on error (partial progress)
        savePendingReview("in_progress");
      });
  } catch (error) {
    logger.error("Review mode error", error);
    
    // Stop any active spinners
    if (analysisSpinner) {
      analysisSpinner.stop("Failed");
      analysisSpinner = null;
    }
    updateToolSpinner(0);
    
    // Show the error - extract message for cleaner display
    const errorMessage = error instanceof Error ? error.message : String(error);
    clack.log.error(errorMessage);
    clack.outro("");
    
    // Save partial progress
    savePendingReview("in_progress");
    
    if (acpClient) {
      await acpClient.close();
    }
    process.exit(1);
  }
}

// Resume mode options
interface ResumeModeOptions {
  reviewId?: string;
  web?: boolean;
  open?: boolean;
}

// Resume mode handler - display a previously saved review or restart an interrupted one
async function runResumeMode(options: ResumeModeOptions) {
  const pc = await import("picocolors");
  const clack = await import("@clack/prompts");
  const {
    listReviews,
    loadReview,
    formatTimeAgo,
    truncatePath,
  } = await import("./review/index.ts");
  const { ReviewApp } = await import("./review/review-app.tsx");

  clack.intro("critique review --resume");

  let reviewId = options.reviewId;

  // If no ID provided, show select (filtered to current cwd and children)
  if (!reviewId) {
    const reviews = listReviews(process.cwd());

    if (reviews.length === 0) {
      clack.log.warn("No saved reviews found for this directory");
      clack.outro("");
      process.exit(0);
    }

    const selected = await clack.select({
      message: "Select a review to display",
      options: reviews.slice(0, 25).map((r) => {
        // Show status and time in label to avoid layout shifts (hints only show on focus)
        const status = r.status === "in_progress" ? pc.default.yellow(" (in progress)") : "";
        const time = formatTimeAgo(r.updatedAt);
        const timeStr = time ? pc.default.dim(`  ${time}`) : "";
        return {
          value: r.id,
          label: `${r.title}${status}${timeStr}`,
        };
      }),
    });

    if (clack.isCancel(selected)) {
      clack.cancel("Operation cancelled");
      process.exit(0);
    }

    reviewId = selected as string;
  }

  // Load the review
  const review = loadReview(reviewId);

  if (!review) {
    clack.log.error(`Review not found: ${reviewId}`);
    clack.outro("");
    process.exit(1);
  }

  // If review is in_progress, try to resume the ACP session
  if (review.status === "in_progress") {
    clack.log.info(`Resuming interrupted review: ${review.title}`);
    
    const { createAcpClient, readReviewYaml, saveReview } = await import("./review/index.ts");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    
    // Create temp file for YAML output (continue from stored content)
    const yamlPath = join(tmpdir(), `critique-review-${Date.now()}.yaml`);
    // Write existing YAML content to temp file so AI can continue from there
    const existingYaml = review.reviewYaml.hunks.length > 0
      ? `title: ${JSON.stringify(review.reviewYaml.title || review.title)}\nhunks:\n` +
        review.reviewYaml.hunks.map((h) => {
          const lines: string[] = [];
          if (h.hunkIds) lines.push(`- hunkIds: [${h.hunkIds.join(", ")}]`);
          else if (h.hunkId !== undefined) {
            lines.push(`- hunkId: ${h.hunkId}`);
            if (h.lineRange) lines.push(`  lineRange: [${h.lineRange[0]}, ${h.lineRange[1]}]`);
          }
          lines.push(`  markdownDescription: |`);
          lines.push(...h.markdownDescription.split("\n").map((l) => `    ${l}`));
          return lines.join("\n");
        }).join("\n")
      : "";
    fs.writeFileSync(yamlPath, existingYaml);
    
    // Connect to ACP and try to resume
    const acpClient = createAcpClient(review.agent);
    acpClient.startConnection();
    
    const resumeSpinner = clack.spinner();
    resumeSpinner.start("Resuming ACP session...");
    
    const resumed = await acpClient.resumeSession(review.id, review.cwd);
    
    if (!resumed) {
      resumeSpinner.stop("Session expired");
      clack.log.warn("ACP session no longer available. Showing partial progress.");
      await acpClient.close();
      fs.unlinkSync(yamlPath);
      // Fall through to display the partial content
    } else {
      resumeSpinner.stop("Session resumed");
      clack.outro("");
      
      // Track for saving on exit
      let reviewSaved = false;
      const savePendingReview = (status: "in_progress" | "completed") => {
        if (reviewSaved) return;
        const reviewYaml = readReviewYaml(yamlPath);
        if (reviewYaml && reviewYaml.hunks.length > 0) {
          saveReview({
            ...review,
            status,
            updatedAt: Date.now(),
            title: reviewYaml.title || review.title,
            reviewYaml,
          });
          reviewSaved = true;
          logger.info("Review saved", { status });
        }
      };
      
      // Start TUI with isGenerating: true
      const renderer = await createCliRenderer({
        onDestroy() {
          savePendingReview("in_progress");
          acpClient.close();
          try { fs.unlinkSync(yamlPath); } catch {}
          process.exit(0);
        },
        exitOnCtrlC: true,
      });
      
      const root = createRoot(renderer);
      root.render(
        <ErrorBoundary>
          <ReviewApp
            hunks={review.hunks}
            yamlPath={yamlPath}
            isGenerating={true}
            initialReviewData={review.reviewYaml}
          />
        </ErrorBoundary>
      );
      
      // Wait for session to complete (it's already running from resume)
      // The ACP client will receive updates and we watch the YAML file
      // For now, just keep the TUI running - it will update from YAML file changes
      return;
    }
  }

  clack.log.info(`Loading: ${review.title}`);

  // Web mode: generate HTML and upload
  if (options.web) {
    const {
      captureResponsiveHtml,
      uploadHtml,
      openInBrowser,
      writeTempFile,
      cleanupTempFile,
    } = await import("./web-utils.ts");

    // Write hunks and YAML to temp files
    const hunksFile = writeTempFile(JSON.stringify(review.hunks), "critique-hunks", ".json");
    const yamlContent = `title: ${JSON.stringify(review.reviewYaml.title || review.title)}\nhunks:\n` +
      review.reviewYaml.hunks.map((h) => {
        const lines: string[] = [];
        if (h.hunkIds) lines.push(`- hunkIds: [${h.hunkIds.join(", ")}]`);
        else if (h.hunkId !== undefined) {
          lines.push(`- hunkId: ${h.hunkId}`);
          if (h.lineRange) lines.push(`  lineRange: [${h.lineRange[0]}, ${h.lineRange[1]}]`);
        }
        lines.push(`  markdownDescription: |`);
        lines.push(...h.markdownDescription.split("\n").map((l) => `    ${l}`));
        return lines.join("\n");
      }).join("\n");
    const yamlFile = writeTempFile(yamlContent, "critique-review", ".yaml");

    // For web, always use default theme (with auto dark/light inversion) unless explicitly overridden
    const themeName = defaultThemeName;
    const totalLines = review.hunks.reduce((sum, h) => sum + h.lines.length, 0);
    const baseRows = Math.max(200, totalLines * 2 + 100);

    const renderCommand = [
      process.argv[1]!,
      "review-web-render",
      yamlFile,
      hunksFile,
      "--theme",
      themeName,
    ];

    const webSpinner = clack.spinner();
    webSpinner.start("Generating web preview...");

    try {
      const { htmlDesktop, htmlMobile } = await captureResponsiveHtml(
        renderCommand,
        { desktopCols: 230, mobileCols: 100, baseRows, themeName }
      );

      cleanupTempFile(hunksFile);
      cleanupTempFile(yamlFile);

      webSpinner.message("Uploading...");
      const result = await uploadHtml(htmlDesktop, htmlMobile);
      webSpinner.stop("Uploaded");

      clack.log.success(`Preview URL: ${result.url}`);
      clack.log.info("(expires in 7 days)");
      clack.outro("");

      if (options.open) {
        await openInBrowser(result.url);
      }
      process.exit(0);
    } catch (error: any) {
      webSpinner.stop("Failed");
      cleanupTempFile(hunksFile);
      cleanupTempFile(yamlFile);
      clack.log.error(`Failed to generate web preview: ${error.message}`);
      clack.outro("");
      process.exit(1);
    }
  }

  // TUI mode: render directly
  clack.outro("");

  const renderer = await createCliRenderer({
    onDestroy() {
      process.exit(0);
    },
    exitOnCtrlC: true,
  });

  const root = createRoot(renderer);
  root.render(
    <ErrorBoundary>
      <ReviewApp
        hunks={review.hunks}
        yamlPath="" // Not used in resume mode - we pass reviewData directly
        isGenerating={false}
        initialReviewData={review.reviewYaml}
      />
    </ErrorBoundary>
  );
}

// Web mode handler
interface WebModeOptions {
  staged?: boolean;
  commit?: string;
  context?: string;
  filter?: string;
  title?: string;
  open?: boolean;
  cols?: number;
  mobileCols?: number;
  theme?: string;
  json?: boolean;
  '--'?: string[];
}

// Image mode handler
interface ImageModeOptions {
  staged?: boolean;
  commit?: string;
  context?: string;
  filter?: string;
  theme?: string;
  '--'?: string[];
}

async function runWebMode(
  base: string | undefined,
  head: string | undefined,
  options: WebModeOptions
) {
  const {
    captureResponsiveHtml,
    uploadHtml,
    openInBrowser,
    writeTempFile,
    cleanupTempFile,
  } = await import("./web-utils.ts");

  // Use stderr for progress when --json is set, stdout otherwise
  const log = options.json ? console.error.bind(console) : console.log.bind(console);

  const gitCommand = buildGitCommand({
    staged: options.staged,
    commit: options.commit,
    base,
    head,
    context: options.context,
    filter: options.filter,
    positionalFilters: options['--'],
  });

  const desktopCols = options.cols || 230;
  const mobileCols = options.mobileCols || 100;
  // For web, always use default theme (with auto dark/light inversion) unless explicitly overridden via --theme
  const themeName = options.theme && themeNames.includes(options.theme)
    ? options.theme
    : defaultThemeName;

  log("Capturing diff output...");

  // Get the git diff first
  const { stdout: gitDiff } = await execAsync(gitCommand, {
    encoding: "utf-8",
  });

  if (!gitDiff.trim()) {
    log("No changes to display");
    if (options.json) {
      console.log(JSON.stringify({ error: "No changes to display" }));
    }
    process.exit(0);
  }

  // Calculate required rows from diff content
  // Strip submodule headers before parsing - git diff --submodule=diff adds
  // "Submodule name hash1..hash2:" lines that the diff parser doesn't understand
  const cleanedDiff = stripSubmoduleHeaders(gitDiff);
  const { parsePatch } = await import("diff");
  const files = parsePatch(cleanedDiff);
  const baseRows = files.reduce((sum, file) => {
    const diffLines = file.hunks.reduce((h, hunk) => h + hunk.lines.length, 0);
    return sum + diffLines + 5; // header + margin per file
  }, 100); // base padding

  // Write cleaned diff to temp file (submodule headers already stripped)
  const diffFile = writeTempFile(cleanedDiff, "critique-web-diff", ".patch");

  // Build render command
  const renderCommand = [
    process.argv[1]!, // path to cli.tsx
    "web-render",
    diffFile,
    "--theme",
    themeName,
  ];

  log("Converting to HTML...");

  try {
    const { htmlDesktop, htmlMobile } = await captureResponsiveHtml(
      renderCommand,
      { desktopCols, mobileCols, baseRows, themeName, title: options.title }
    );

    // Clean up temp file
    cleanupTempFile(diffFile);

    log("Uploading...");

    const result = await uploadHtml(htmlDesktop, htmlMobile);

    log(`\nPreview URL: ${result.url}`);
    log(`(expires in 7 days)`);
    if (options.json) {
      console.log(JSON.stringify({ url: result.url, id: result.id }));
    }

    if (options.open) {
      await openInBrowser(result.url);
    }
    
    process.exit(0);
  } catch (error: unknown) {
    cleanupTempFile(diffFile);
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to generate web preview:", message);
    if (options.json) {
      console.log(JSON.stringify({ error: message }));
    }
    process.exit(1);
  }
}

async function runImageMode(
  base: string | undefined,
  head: string | undefined,
  options: ImageModeOptions
) {
  const { renderTerminalToImages } = await import("./image.ts");
  const { writeTempFile, cleanupTempFile } = await import("./web-utils.ts");

  const gitCommand = buildGitCommand({
    staged: options.staged,
    commit: options.commit,
    base,
    head,
    context: options.context,
    filter: options.filter,
    positionalFilters: options['--'],
  });

  const themeName = options.theme && themeNames.includes(options.theme)
    ? options.theme
    : persistedState.themeName ?? defaultThemeName;

  console.log("Capturing diff output...");

  // Get the git diff
  const { stdout: gitDiff } = await execAsync(gitCommand, {
    encoding: "utf-8",
  });

  if (!gitDiff.trim()) {
    console.log("No changes to display");
    process.exit(0);
  }

  // Write diff to temp file
  const diffFile = writeTempFile(gitDiff, "critique-image-diff", ".patch");

  // Build render command for image capture
  const renderCommand = [
    process.argv[1]!, // path to cli.tsx
    "web-render",
    diffFile,
    "--theme",
    themeName,
    "--cols",
    "120",
    "--rows",
    "10000",
  ];

  console.log("Rendering to images...");

  try {
    // Capture PTY output
    const decoder = new TextDecoder();
    let ansiOutput = "";
    const cols = 120;
    const rows = 10000;

    const proc = Bun.spawn(["bun", ...renderCommand], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: "xterm-256color",
      },
      terminal: {
        cols,
        rows,
        data(terminal, data) {
          ansiOutput += decoder.decode(data, { stream: true });
        },
      },
    });

    await proc.exited;
    proc.terminal?.close();
    ansiOutput += decoder.decode();

    // Clean up diff temp file
    cleanupTempFile(diffFile);

    if (!ansiOutput.trim()) {
      console.error("No output captured");
      process.exit(1);
    }

    // Strip terminal cleanup sequences
    const clearIdx = ansiOutput.lastIndexOf("\x1b[H\x1b[J");
    if (clearIdx > 0) {
      ansiOutput = ansiOutput.slice(0, clearIdx);
    }

    // Render to images
    const result = await renderTerminalToImages(ansiOutput, {
      cols,
      themeName,
    });

    console.log(`\nGenerated ${result.imageCount} image${result.imageCount === 1 ? "" : "s"}:`);
    for (const path of result.paths) {
      console.log(`  ${path}`);
    }

    process.exit(0);
  } catch (error: unknown) {
    cleanupTempFile(diffFile);
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to generate images:", message);
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
    this.macosAccel = new MacOSScrollAccel({ A: 1.5, maxMultiplier: 10 });
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
  const themeName = useAppStore((s) => s.themeName);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [showThemePicker, setShowThemePicker] = React.useState(false);
  const [previewTheme, setPreviewTheme] = React.useState<string | null>(null);

  // Refs for scroll-to-file functionality
  const scrollboxRef = React.useRef<ScrollBoxRenderable | null>(null);
  const fileRefs = React.useRef<Map<number, BoxRenderable>>(new Map());

  // Ref for double-tap detection (gg)
  const lastKeyRef = React.useRef<{ key: string; time: number } | null>(null);

  useOnResize(
    React.useCallback((newWidth: number) => {
      setWidth(newWidth);
    }, []),
  );

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

    if (key.name === "p") {
      setShowDropdown(true);
      return;
    }

    if (key.name === "t") {
      setShowThemePicker(true);
      return;
    }

    if (key.name === "z" && key.ctrl) {
      renderer.console.toggle();
      return;
    }

    // Vim-style scroll navigation
    const scrollbox = scrollboxRef.current;
    if (scrollbox) {
      // G - go to bottom
      if (key.name === "g" && key.shift) {
        scrollbox.scrollBy(1, "content");
        return;
      }

      // gg - go to top (double-tap within 300ms)
      if (key.name === "g" && !key.shift && !key.ctrl) {
        const now = Date.now();
        if (lastKeyRef.current?.key === "g" && now - lastKeyRef.current.time < 300) {
          scrollbox.scrollTo(0);
          lastKeyRef.current = null;
        } else {
          lastKeyRef.current = { key: "g", time: now };
        }
        return;
      }

      // Ctrl+D - half page down
      if (key.ctrl && key.name === "d") {
        scrollbox.scrollBy(0.5, "viewport");
        return;
      }

      // Ctrl+U - half page up
      if (key.ctrl && key.name === "u") {
        scrollbox.scrollBy(-0.5, "viewport");
        return;
      }
    }

    if (key.option) {
      if (key.eventType === "release") {
        scrollAcceleration.multiplier = 1;
      } else {
        scrollAcceleration.multiplier = 10;
      }
    }
  });

  if (parsedFiles.length === 0) {
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

  // Use preview theme if hovering, otherwise use selected theme
  const activeTheme = previewTheme ?? themeName;
  const resolvedTheme = getResolvedTheme(activeTheme);
  const bgColor = resolvedTheme.background;
  const textColor = rgbaToHex(resolvedTheme.text);
  const mutedColor = rgbaToHex(resolvedTheme.textMuted);

  const dropdownOptions = parsedFiles.map((file, idx) => {
    const name = getFileName(file);
    return {
      title: name,
      value: String(idx),
      keywords: name.split("/"),
    };
  });

  // Build tree data for directory tree view
  const treeFiles: TreeFileInfo[] = parsedFiles.map((file, idx) => {
    const { additions, deletions } = countChanges(file.hunks);
    return {
      path: getFileName(file),
      status: getFileStatus(file),
      additions,
      deletions,
      fileIndex: idx,
    };
  });

  // Scroll to file by index
  const scrollToFile = (index: number) => {
    const scrollbox = scrollboxRef.current;
    const fileRef = fileRefs.current.get(index);
    if (scrollbox && fileRef) {
      const contentY = scrollbox.content?.y ?? 0;
      const targetY = fileRef.y - contentY;
      scrollbox.scrollTo(Math.max(0, targetY));
    }
  };

  const handleFileSelect = (value: string) => {
    const index = parseInt(value, 10);
    scrollToFile(index);
    setShowDropdown(false);
  };

  const handleTreeFileSelect = (fileIndex: number) => {
    scrollToFile(fileIndex);
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

  // Render all files content (used in both theme picker preview and main view)
  const renderAllFiles = () => (
    <box style={{ flexDirection: "column" }}>
      {/* Directory tree at the top */}
      <box style={{ marginBottom: 2 }}>
        <DirectoryTreeView
          files={treeFiles}
          onFileSelect={handleTreeFileSelect}
          themeName={activeTheme}
        />
      </box>

      {parsedFiles.map((file, idx) => {
        const fileName = getFileName(file);
        const filetype = detectFiletype(fileName);
        const { additions, deletions } = countChanges(file.hunks);
        const viewMode = getViewMode(additions, deletions, width);

        return (
          <box
            key={idx}
            ref={(r: BoxRenderable | null) => {
              if (r) fileRefs.current.set(idx, r);
            }}
            style={{ flexDirection: "column", marginBottom: 2 }}
          >
            {/* File header */}
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
              <text fg={textColor}>{fileName.trim()}</text>
              <text fg="#2d8a47"> +{additions}</text>
              <text fg="#c53b53">-{deletions}</text>
            </box>
            <DiffView
              diff={file.rawDiff || ""}
              view={viewMode}
              filetype={filetype}
              themeName={activeTheme}
            />
          </box>
        );
      })}
    </box>
  );

  // Always render the same structure - scrollbox is never remounted
  return (
    <box
      style={{
        flexDirection: "column",
        height: "100%",
        padding: 1,
        backgroundColor: bgColor,
      }}
    >
      {/* Dropdown overlay - conditionally shown */}
      {showThemePicker && (
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
      )}
      {showDropdown && (
        <box style={{ flexShrink: 0, maxHeight: 15 }}>
          <Dropdown
            tooltip="Select file"
            options={dropdownOptions}
            selectedValues={[]}
            onChange={handleFileSelect}
            placeholder="Search files..."
            itemsPerPage={6}
            theme={resolvedTheme}
          />
        </box>
      )}

      {/* Scrollbox - always mounted, preserves scroll position */}
      <scrollbox
        ref={scrollboxRef}
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
              foregroundColor: mutedColor,
              backgroundColor: bgColor,
            },
          },
        }}
        focused={!showDropdown && !showThemePicker}
      >
        {renderAllFiles()}
      </scrollbox>

      {/* Footer - hidden when dropdown is open */}
      {!showDropdown && !showThemePicker && (
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
          <text fg={textColor}>p</text>
          <text fg={mutedColor}> files ({parsedFiles.length})  </text>
          <text fg={textColor}>t</text>
          <text fg={mutedColor}> theme</text>
          <box flexGrow={1} />
          <text fg={mutedColor}>run with </text>
          <text fg={textColor}><b>--web</b></text>
          <text fg={mutedColor}> to share & collaborate</text>
        </box>
      )}
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
  .option("--theme <name>", "Theme to use for rendering")
  .option("--web [title]", "Generate web preview instead of TUI")
  .option("--image", "Generate images instead of TUI (saved to /tmp)")
  .option("--open", "Open in browser (with --web)")
  .option("--json", "Output JSON to stdout (with --web)")
  .option("--cols <cols>", "Desktop columns for web render", { default: 240 })
  .option("--mobile-cols <cols>", "Mobile columns for web render", { default: 100 })
  .option("--stdin", "Read diff from stdin (for use as a pager)")
  .action(async (base, head, options) => {
    // Apply theme if specified (zustand subscription auto-persists)
    if (options.theme && themeNames.includes(options.theme)) {
      useAppStore.setState({ themeName: options.theme });
    }

    // Handle stdin mode (for lazygit pager integration)
    if (options.stdin) {
      let gitDiff = "";
      for await (const chunk of process.stdin) {
        gitDiff += chunk;
      }

      const [diffModule, renderer] = await Promise.all([
        import("diff"),
        createCliRenderer({
          onDestroy() {
            process.exit(0);
          },
          exitOnCtrlC: true,
        }),
      ]);

      const parsedFiles = gitDiff.trim()
        ? processFiles(diffModule.parsePatch(stripSubmoduleHeaders(gitDiff)), diffModule.formatPatch)
        : [];

      createRoot(renderer).render(
        <ErrorBoundary>
          <App parsedFiles={parsedFiles} />
        </ErrorBoundary>
      );
      return;
    }

    // If --web flag, delegate to web generation logic
    if (options.web !== undefined) {
      const title = typeof options.web === 'string' ? options.web : undefined;
      await runWebMode(base, head, {
        staged: options.staged,
        commit: options.commit,
        context: options.context,
        filter: options.filter,
        title,
        open: options.open,
        json: options.json,
        cols: parseInt(options.cols) || 240,
        mobileCols: parseInt(options.mobileCols) || 100,
        theme: options.theme,
        '--': options['--'],
      });
      return;
    }

    // If --image flag, delegate to image generation logic
    if (options.image) {
      await runImageMode(base, head, {
        staged: options.staged,
        commit: options.commit,
        context: options.context,
        filter: options.filter,
        theme: options.theme,
        '--': options['--'],
      });
      return;
    }

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

        const watchRenderer = useRenderer();

        // Handle exit keys (Q, Escape) for loading and empty states
        useKeyboard((key) => {
          if (key.name === "escape" || key.name === "q") {
            watchRenderer.destroy();
          }
        });

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

              const files = parsePatch(stripSubmoduleHeaders(gitDiff));
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
        <ErrorBoundary>
          <AppWithWatch />
        </ErrorBoundary>
      );
    } catch (error) {
      console.error("Error getting git diff:", error);
      process.exit(1);
    }
  });

cli
  .command("review [base] [head]", "AI-powered diff review")
  .option("--agent <name>", "AI agent to use (default: opencode)", { default: "opencode" })
  .option("--model <id>", "Model to use for review (e.g., anthropic/claude-sonnet-4-20250514 for opencode, claude-sonnet-4-20250514 for claude)")
  .option("--staged", "Review staged changes")
  .option("--commit <ref>", "Review changes from a specific commit")
  .option("--context <lines>", "Number of context lines (default: 3)")
  .option("--filter <pattern>", "Filter files by glob pattern")
  .option("--session <id>", "Session ID(s) to include as context (can be repeated)")
  .option("--web", "Generate web preview instead of TUI")
  .option("--open", "Open web preview in browser (with --web)")
  .option("--json", "Output JSON to stdout (implies --web)")
  .option("--resume [id]", "Resume a previous review (shows select if no ID provided)")
  .action(async (base, head, options) => {
    try {
      // Handle resume mode
      if (options.resume !== undefined) {
        await runResumeMode({
          reviewId: typeof options.resume === "string" ? options.resume : undefined,
          web: options.web,
          open: options.open,
        });
        return;
      }

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

      // --json implies --web
      const useWeb = options.web || options.json;
      const webOptions = useWeb ? { web: true, open: options.open } : undefined;
      await runReviewMode(gitCommand, options.agent, {
        sessionIds,
        webOptions,
        model: options.model,
        json: options.json,
      });
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
        <ErrorBoundary>
          <App parsedFiles={[patchWithRawDiff]} />
        </ErrorBoundary>
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
  .command("web [base] [head]", "DEPRECATED: Use --web flag instead")
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
  .option("--open", "Open in browser after generating")
  .option("--context <lines>", "Number of context lines (default: 3)")
  .option("--theme <name>", "Theme to use for rendering")
  .option("--filter <pattern>", "Filter files by glob pattern (can be used multiple times)")
  .option("--title <title>", "HTML document title")
  .action(async (base, head, options) => {
    await runWebMode(base, head, {
      staged: options.staged,
      commit: options.commit,
      context: options.context,
      filter: options.filter,
      title: options.title,
      open: options.open,
      cols: parseInt(options.cols) || 240,
      mobileCols: parseInt(options.mobileCols) || 100,
      theme: options.theme,
      '--': options['--'],
    });
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
    // Strip submodule headers just in case the file came from external source
    const files = parsePatch(stripSubmoduleHeaders(gitDiff));
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
      <ErrorBoundary>
        <WebApp />
      </ErrorBoundary>
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
      return (
        <ReviewAppView
          hunks={hunks}
          reviewData={reviewData}
          isGenerating={false}
          themeName={themeName}
          width={cols}
          showFooter={false}
        />
      );
    }

    createRoot(renderer).render(
      <ErrorBoundary>
        <ReviewWebApp />
      </ErrorBoundary>
    );
  });

cli.help();
cli.version("1.0.0");
cli.parse();
