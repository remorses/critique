#!/usr/bin/env node
/**
 * Captures real opentui output for use in the web preview
 * Run: node --experimental-strip-types scripts/capture-example.ts
 * Or: npx tsx scripts/capture-example.ts
 */
import pty from "node-pty";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLS = 240;
const ROWS = 50;

/**
 * Clean ANSI output by removing terminal control sequences not needed for static display
 */
function cleanAnsiOutput(raw: string): string {
  let cleaned = raw;
  
  // Remove OSC sequences: ESC ] ... ST (or BEL)
  // These are Operating System Commands like setting window title
  cleaned = cleaned.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
  
  // Remove DCS sequences: ESC P ... ST
  cleaned = cleaned.replace(/\x1bP[^\x1b]*\x1b\\/g, "");
  
  // Remove APC sequences: ESC _ ... ST
  cleaned = cleaned.replace(/\x1b_[^\x1b]*\x1b\\/g, "");
  
  // Remove terminal query sequences (private modes, device attributes, etc.)
  // [?...$ sequences (DECRQM - request mode)
  cleaned = cleaned.replace(/\x1b\[\?[0-9;]*\$p/g, "");
  // [>...q sequences (terminal version query)
  cleaned = cleaned.replace(/\x1b\[>[0-9]*q/g, "");
  // [?u sequences (kitty keyboard protocol query)
  cleaned = cleaned.replace(/\x1b\[\?u/g, "");
  // [c and [>c sequences (device attributes)
  cleaned = cleaned.replace(/\x1b\[>?c/g, "");
  // [6n sequences (cursor position query)
  cleaned = cleaned.replace(/\x1b\[[0-9]*n/g, "");
  
  // Remove cursor save/restore that wrap queries
  cleaned = cleaned.replace(/\x1b\[s/g, "");
  cleaned = cleaned.replace(/\x1b\[u/g, "");
  cleaned = cleaned.replace(/\x1b7/g, "");
  cleaned = cleaned.replace(/\x1b8/g, "");
  
  // Remove cursor visibility sequences
  cleaned = cleaned.replace(/\x1b\[\?25[hl]/g, "");
  
  // Remove mouse tracking sequences
  cleaned = cleaned.replace(/\x1b\[\?100[0-6][hl]/g, "");
  cleaned = cleaned.replace(/\x1b\[\?1015[hl]/g, "");
  
  // Remove bracketed paste mode
  cleaned = cleaned.replace(/\x1b\[\?2004[hl]/g, "");
  
  // Remove focus tracking
  cleaned = cleaned.replace(/\x1b\[\?1004[hl]/g, "");
  
  // Remove synchronized output
  cleaned = cleaned.replace(/\x1b\[\?2026[hl]/g, "");
  
  // Remove other private mode sequences
  cleaned = cleaned.replace(/\x1b\[\?[0-9;]+[hl]/g, "");
  
  // Remove window size query [14t]
  cleaned = cleaned.replace(/\x1b\[[0-9]*t/g, "");
  
  // Remove cursor style [N q]
  cleaned = cleaned.replace(/\x1b\[[0-9]* ?q/g, "");
  
  // Remove screen clear sequences at the end
  cleaned = cleaned.replace(/\x1b\[H\x1b\[J/g, "");
  
  return cleaned;
}

// Create a sample diff
const oldContent = `import { foo } from "./api";

export function Example() {
  const [value, setValue] = useState(0);
  return <div>{value}</div>;
}`;

const newContent = `import { foo, bar } from "./api";
import { useCallback } from "react";

export function Example() {
  const [value, setValue] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(() => {
    setLoading(true);
    bar().then(setValue).finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div onClick={handleClick}>
      {value}
    </div>
  );
}`;

// Write temp files
const tmpDir = "/tmp";
const oldFile = path.join(tmpDir, "capture-old.tsx");
const newFile = path.join(tmpDir, "capture-new.tsx");
const diffFile = path.join(tmpDir, "capture.diff");

fs.writeFileSync(oldFile, oldContent);
fs.writeFileSync(newFile, newContent);

// Generate diff
const { execSync } = await import("child_process");
try {
  execSync(`diff -u "${oldFile}" "${newFile}" > "${diffFile}"`, { stdio: "pipe" });
} catch {
  // diff returns non-zero when files differ, that's expected
}

console.log("Capturing opentui output...");

let output = "";

const ptyProcess = pty.spawn("bun", [
  path.join(__dirname, "../src/cli.tsx"),
  "web-render",
  diffFile,
  "--width", String(COLS),
  "--height", String(ROWS),
], {
  name: "xterm-256color",
  cols: COLS,
  rows: ROWS,
  cwd: process.cwd(),
  env: { ...process.env, TERM: "xterm-256color" },
});

ptyProcess.onData((data) => {
  output += data;
});

ptyProcess.onExit(() => {
  // Clean up temp files
  fs.unlinkSync(oldFile);
  fs.unlinkSync(newFile);
  fs.unlinkSync(diffFile);

  // Clean the output to remove terminal control sequences
  const cleaned = cleanAnsiOutput(output);

  // Save output
  const outputFile = path.join(__dirname, "../web/example.ansi");
  fs.writeFileSync(outputFile, cleaned);
  
  console.log(`Saved ${cleaned.length} bytes to web/example.ansi (raw: ${output.length} bytes)`);
  process.exit(0);
});
