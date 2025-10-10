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
        p.log.error("Cannot pick from the same branch");
        process.exit(1);
      }

      const { stdout: branchExists } = await execAsync(
        `git rev-parse --verify ${branch}`,
        { encoding: "utf-8" },
      ).catch(() => ({ stdout: "" }));

      if (!branchExists.trim()) {
        p.log.error(`Branch "${branch}" does not exist`);
        process.exit(1);
      }

      const { stdout: diffOutput } = await execAsync(
        `git diff --name-only HEAD ${branch}`,
        { encoding: "utf-8" },
      );

      const files = diffOutput
        .trim()
        .split("\n")
        .filter((f) => f);

      if (files.length === 0) {
        p.log.info("No differences found between branches");
        process.exit(0);
      }

      const selectedFiles = await p.multiselect({
        message: `Select files to pick from "${branch}":`,

        options: files.map((file) => ({
          value: file,
          label: file,
        })),
        required: false,
      });

      if (p.isCancel(selectedFiles)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      if (!selectedFiles || selectedFiles.length === 0) {
        p.log.info("No files selected");
        process.exit(0);
      }

      const { stdout: patchData } = await execAsync(
        `git diff HEAD ${branch} --no-prefix -- ${selectedFiles.join(" ")}`,
        { encoding: "utf-8" },
      );

      const patchFile = join(tmpdir(), `critique-pick-${Date.now()}.patch`);
      fs.writeFileSync(patchFile, patchData);

      try {
        execSync(`git apply "${patchFile}"`, { stdio: "inherit" });
        p.log.success(`Applied changes from ${selectedFiles.length} file(s)`);
      } finally {
        fs.unlinkSync(patchFile);
      }
    } catch (error) {
      p.log.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  });

cli.help();
cli.version("1.0.0");

cli.parse();
