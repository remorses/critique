import { init, Terminal } from "ghostty-web";
import EXAMPLE_ANSI from "./example.ansi?raw";

const FONT_FAMILY = "Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace";
const MAX_FONT_SIZE = 16;
const MIN_FONT_SIZE = 6;

// Measure character width for a given font size
function measureCharWidth(fontSize: number): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  return ctx.measureText("M").width;
}

// Calculate optimal font size to fit cols in window width
function calculateFontSize(cols: number, windowWidth: number): number {
  const padding = 20;
  const availableWidth = windowWidth - padding;
  
  // Start from max and go down until it fits
  for (let size = MAX_FONT_SIZE; size >= MIN_FONT_SIZE; size--) {
    const charWidth = measureCharWidth(size);
    const totalWidth = charWidth * cols;
    if (totalWidth <= availableWidth) {
      return size;
    }
  }
  
  return MIN_FONT_SIZE;
}

// Count rows in ANSI content
function countRows(ansi: string): number {
  return ansi.split("\n").length;
}

// Create and render terminal
function createTerminal(
  container: HTMLElement,
  content: string,
  cols: number,
  fontSize: number
): Terminal {
  const rows = countRows(content) + 1;

  const term = new Terminal({
    cursorBlink: false,
    fontSize: fontSize,
    fontFamily: FONT_FAMILY,
    theme: {
      background: "#0f0f0f",
      foreground: "#ffffff",
      cursor: "#0f0f0f",
      cursorAccent: "#0f0f0f",
    },
  });

  term.open(container);
  // IMPORTANT: resize before writing to prevent wrapping
  term.resize(cols, rows);
  // Replace \n with \r\n for proper terminal rendering
  const normalizedContent = content.replace(/\r?\n/g, "\r\n");
  term.write(normalizedContent);

  return term;
}

async function main() {
  await init();

  const container = document.getElementById("terminal");
  if (!container) {
    throw new Error("Terminal container not found");
  }

  container.innerHTML = "";

  // Get params from URL
  const urlParams = new URLSearchParams(window.location.search);
  const gistId = urlParams.get("gist");
  const cols = parseInt(urlParams.get("cols") || "240");
  const manualFontSize = urlParams.get("fontSize");

  // Load content first
  let content = EXAMPLE_ANSI;
  
  if (gistId) {
    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`);
      const gist = await response.json();
      const files = Object.values(gist.files) as Array<{ content: string }>;
      if (files.length > 0) {
        content = files[0].content;
      }
    } catch (error) {
      content = `\x1b[31mError loading gist: ${error}\x1b[0m`;
    }
  }

  // Calculate font size (capped at 16)
  let fontSize = manualFontSize 
    ? Math.min(parseInt(manualFontSize), MAX_FONT_SIZE)
    : calculateFontSize(cols, window.innerWidth);

  console.log(`Terminal: ${cols} cols, fontSize: ${fontSize}px, window: ${window.innerWidth}px`);

  // Create terminal
  let term = createTerminal(container, content, cols, fontSize);

  // Recreate on window resize
  let resizeTimeout: number;
  window.addEventListener("resize", () => {
    if (manualFontSize) return;
    
    clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(() => {
      const newFontSize = calculateFontSize(cols, window.innerWidth);
      if (newFontSize !== fontSize) {
        fontSize = newFontSize;
        container.innerHTML = "";
        term = createTerminal(container, content, cols, fontSize);
        console.log(`Resized to fontSize: ${fontSize}px`);
      }
    }, 150);
  });
}

main().catch(console.error);
