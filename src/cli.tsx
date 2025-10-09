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
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const cli = cac("critique");

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
        if (options.staged) return "git diff --cached";
        if (options.commit) return `git show ${options.commit}`;
        if (ref) return `git show ${ref}`;
        return "git diff";
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

      const { ErrorBoundary, FileEditPreviewTitle, FileEditPreview } =
        diffModule;

      function App() {
        const { width: initialWidth } = useTerminalDimensions();
        const [width, setWidth] = React.useState(initialWidth);

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
        });

        return (
          <box
            key={String(useSplitView)}
            style={{ flexDirection: "column", height: "100%", padding: 1 }}
          >
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
                    style={{
                      flexDirection: "column",
                      marginBottom: idx < parsedFiles.length - 1 ? 2 : 0,
                    }}
                  >
                    <FileEditPreviewTitle
                      filePath={
                        file.newFileName || file.oldFileName || "unknown"
                      }
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

      await render(
        React.createElement(ErrorBoundary, null, React.createElement(App)),
      );
    } catch (error) {
      console.error("Error getting git diff:", error);
      process.exit(1);
    }
  });

cli.help();
cli.version("1.0.0");

cli.parse();
