#!/usr/bin/env bun
import { cac } from "cac";
import { parsePatch } from "diff";
import { render, useTerminalDimensions } from "@opentui/react";
import * as React from "react";
import { execSync } from "child_process";
import {
  ErrorBoundary,
  FileEditPreviewTitle,
  FileEditPreview,
} from "./diff.tsx";

const cli = cac("critique");

cli
  .command("[ref]", "Show diff for a git reference (defaults to unstaged changes)")
  .option("--staged", "Show staged changes")
  .option("--commit <ref>", "Show changes from a specific commit")
  .action(async (ref, options) => {
    let gitDiff: string;

    try {
      if (options.staged) {
        gitDiff = execSync("git diff --cached", { encoding: "utf-8" });
      } else if (options.commit) {
        gitDiff = execSync(`git show ${options.commit}`, { encoding: "utf-8" });
      } else if (ref) {
        gitDiff = execSync(`git show ${ref}`, { encoding: "utf-8" });
      } else {
        gitDiff = execSync("git diff", { encoding: "utf-8" });
      }
    } catch (error) {
      console.error("Error getting git diff:", error);
      process.exit(1);
    }

    if (!gitDiff.trim()) {
      console.log("No changes to display");
      process.exit(0);
    }

    const parsedFiles = parsePatch(gitDiff);

    if (parsedFiles.length === 0) {
      console.log("No changes to display");
      process.exit(0);
    }

    function App() {
      const { width } = useTerminalDimensions();
      const useSplitView = width >= 100;

      return (
        <box style={{ flexDirection: "column", height: "100%", padding: 1 }}>
          <scrollbox
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
                  style={{ flexDirection: "column", marginBottom: idx < parsedFiles.length - 1 ? 2 : 0 }}
                >
                  <FileEditPreviewTitle
                    filePath={file.newFileName || file.oldFileName || "unknown"}
                    hunks={file.hunks}
                  />
                  <box paddingTop={1} />
                  <FileEditPreview hunks={file.hunks} paddingLeft={0} splitView={useSplitView} />
                </box>
              ))}
            </box>
          </scrollbox>
        </box>
      );
    }

    await render(
      React.createElement(ErrorBoundary, null, React.createElement(App)),
    );
  });

cli.help();
cli.version("1.0.0");

cli.parse();
