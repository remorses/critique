// Syntax highlighting theme system with 30+ themes from OpenCode.
// Loads JSON theme files lazily on demand, resolves color references,
// and provides both UI colors and Tree-sitter compatible syntax styles.

import { parseColor, RGBA } from "@opentui/core";
import { fileURLToPath } from "url";

// Only import the default theme statically for fast startup
// Other themes are loaded on-demand when selected
import github from "./themes/github.json";

type HexColor = `#${string}`;
type RefName = string;
type Variant = {
  dark: HexColor | RefName;
  light: HexColor | RefName;
};
type ColorValue = HexColor | RefName | Variant;

interface ThemeJson {
  $schema?: string;
  defs?: Record<string, HexColor | RefName>;
  theme: Record<string, ColorValue>;
}

export interface ResolvedTheme {
  // UI colors
  primary: RGBA;
  // Status colors
  success: RGBA;
  error: RGBA;
  warning: RGBA;
  info: RGBA;
  // Syntax colors
  syntaxComment: RGBA;
  syntaxKeyword: RGBA;
  syntaxFunction: RGBA;
  syntaxVariable: RGBA;
  syntaxString: RGBA;
  syntaxNumber: RGBA;
  syntaxType: RGBA;
  syntaxOperator: RGBA;
  syntaxPunctuation: RGBA;
  // Text colors
  text: RGBA;
  textMuted: RGBA;
  conceal: RGBA;
  // Diff colors (foreground)
  diffAdded: RGBA;
  diffRemoved: RGBA;
  // Diff colors (background)
  diffAddedBg: RGBA;
  diffRemovedBg: RGBA;
  diffContextBg: RGBA;
  diffAddedLineNumberBg: RGBA;
  diffRemovedLineNumberBg: RGBA;
  diffLineNumber: RGBA;
  // Background
  background: RGBA;
  backgroundPanel: RGBA;
  // Markdown colors
  markdownText: RGBA;
  markdownHeading: RGBA;
  markdownLink: RGBA;
  markdownLinkText: RGBA;
  markdownCode: RGBA;
  markdownBlockQuote: RGBA;
  markdownEmph: RGBA;
  markdownStrong: RGBA;
  markdownHorizontalRule: RGBA;
  markdownListItem: RGBA;
  markdownListEnumeration: RGBA;
  markdownImage: RGBA;
  markdownImageText: RGBA;
  markdownCodeBlock: RGBA;
}

export interface SyntaxThemeStyle {
  fg: RGBA;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface SyntaxTheme {
  [key: string]: SyntaxThemeStyle;
}

// Theme name to file mapping for lazy loading
const THEME_FILES: Record<string, string> = {
  aura: "aura.json",
  ayu: "ayu.json",
  catppuccin: "catppuccin.json",
  "catppuccin-frappe": "catppuccin-frappe.json",
  "catppuccin-macchiato": "catppuccin-macchiato.json",
  cobalt2: "cobalt2.json",
  cursor: "cursor.json",
  dracula: "dracula.json",
  everforest: "everforest.json",
  flexoki: "flexoki.json",
  github: "github.json",
  "github-light": "github-light.json",
  gruvbox: "gruvbox.json",
  kanagawa: "kanagawa.json",
  "lucent-orng": "lucent-orng.json",
  material: "material.json",
  matrix: "matrix.json",
  mercury: "mercury.json",
  monokai: "monokai.json",
  nightowl: "nightowl.json",
  nord: "nord.json",
  "one-dark": "one-dark.json",
  opencode: "opencode.json",
  "opencode-light": "opencode-light.json",
  orng: "orng.json",
  palenight: "palenight.json",
  rosepine: "rosepine.json",
  solarized: "solarized.json",
  synthwave84: "synthwave84.json",
  tokyonight: "tokyonight.json",
  vercel: "vercel.json",
  vesper: "vesper.json",
  zenburn: "zenburn.json",
};

// Cache for loaded themes
const themeCache: Record<string, ThemeJson> = {
  github, // Pre-loaded default theme
};

// Synchronously load a theme (themes are small JSON files)
function loadTheme(name: string): ThemeJson {
  if (themeCache[name]) {
    return themeCache[name];
  }

  const fileName = THEME_FILES[name];
  if (!fileName) {
    return github; // Fallback to default
  }

  try {
    // Use dynamic import with synchronous pattern for JSON
    // This works because JSON imports are resolved at bundle time by Bun
    const themeUrl = new URL(`./themes/${fileName}`, import.meta.url);
    // Read file synchronously using Node fs (works in Bun)
    const themePath = fileURLToPath(themeUrl);
    const fs = require("fs");
    const content = fs.readFileSync(themePath, "utf-8");
    const themeJson = JSON.parse(content) as ThemeJson;
    themeCache[name] = themeJson;
    return themeJson;
  } catch {
    return github; // Fallback to default
  }
}

function resolveTheme(
  themeJson: ThemeJson,
  mode: "dark" | "light",
): ResolvedTheme {
  const defs = themeJson.defs ?? {};

  function resolveColor(c: ColorValue): RGBA {
    if (typeof c === "string") {
      if (c === "transparent" || c === "none") return RGBA.fromInts(0, 0, 0, 0);
      if (c.startsWith("#")) return parseColor(c);
      // Reference to defs
      if (defs[c] != null) {
        return resolveColor(defs[c] as ColorValue);
      }
      // Reference to another theme property
      if (themeJson.theme[c] !== undefined) {
        return resolveColor(themeJson.theme[c] as ColorValue);
      }
      // Fallback
      return RGBA.fromInts(128, 128, 128, 255);
    }
    // Variant with dark/light
    return resolveColor(c[mode]);
  }

  const t = themeJson.theme;
  const fallbackGray: ColorValue = "#808080";
  const fallbackBg: ColorValue = "#1e1e1e";
  const fallbackText: ColorValue = "#d4d4d4";

  const text = resolveColor(t.text ?? fallbackText);

  // Fallback colors for status (green, red, yellow, orange)
  const fallbackGreen: ColorValue = "#3fb950";
  const fallbackRed: ColorValue = "#f85149";
  const fallbackYellow: ColorValue = "#e3b341";
  const fallbackOrange: ColorValue = "#d29922";

  return {
    primary: resolveColor(t.primary ?? t.syntaxFunction ?? fallbackGray),
    // Status colors
    success: resolveColor(t.success ?? fallbackGreen),
    error: resolveColor(t.error ?? fallbackRed),
    warning: resolveColor(t.warning ?? fallbackYellow),
    info: resolveColor(t.info ?? fallbackOrange),
    // Syntax colors
    syntaxComment: resolveColor(t.syntaxComment ?? fallbackGray),
    syntaxKeyword: resolveColor(t.syntaxKeyword ?? fallbackGray),
    syntaxFunction: resolveColor(t.syntaxFunction ?? fallbackGray),
    syntaxVariable: resolveColor(t.syntaxVariable ?? fallbackGray),
    syntaxString: resolveColor(t.syntaxString ?? fallbackGray),
    syntaxNumber: resolveColor(t.syntaxNumber ?? fallbackGray),
    syntaxType: resolveColor(t.syntaxType ?? fallbackGray),
    syntaxOperator: resolveColor(t.syntaxOperator ?? fallbackGray),
    syntaxPunctuation: resolveColor(t.syntaxPunctuation ?? fallbackGray),
    text,
    textMuted: resolveColor(t.textMuted ?? fallbackGray),
    conceal: resolveColor(t.conceal ?? t.textMuted ?? fallbackGray),
    // Diff foreground colors
    diffAdded: resolveColor(t.diffAdded ?? t.success ?? fallbackGreen),
    diffRemoved: resolveColor(t.diffRemoved ?? t.error ?? fallbackRed),
    // Diff background colors
    diffAddedBg: resolveColor(t.diffAddedBg ?? "#1e3a1e"),
    diffRemovedBg: resolveColor(t.diffRemovedBg ?? "#3a1e1e"),
    diffContextBg: resolveColor(t.diffContextBg ?? fallbackBg),
    diffAddedLineNumberBg: resolveColor(t.diffAddedLineNumberBg ?? "#1e3a1e"),
    diffRemovedLineNumberBg: resolveColor(
      t.diffRemovedLineNumberBg ?? "#3a1e1e",
    ),
    diffLineNumber: resolveColor(t.diffLineNumber ?? fallbackGray),
    background: resolveColor(t.background ?? fallbackBg),
    backgroundPanel: resolveColor(t.backgroundPanel ?? fallbackBg),
    // Markdown colors - fallback to text/syntax colors if not defined
    markdownText: resolveColor(t.markdownText ?? t.text ?? fallbackText),
    markdownHeading: resolveColor(t.markdownHeading ?? t.primary ?? fallbackGray),
    markdownLink: resolveColor(t.markdownLink ?? t.syntaxString ?? fallbackGray),
    markdownLinkText: resolveColor(t.markdownLinkText ?? t.primary ?? fallbackGray),
    markdownCode: resolveColor(t.markdownCode ?? t.syntaxString ?? fallbackGray),
    markdownBlockQuote: resolveColor(t.markdownBlockQuote ?? t.syntaxComment ?? fallbackGray),
    markdownEmph: resolveColor(t.markdownEmph ?? t.text ?? fallbackText),
    markdownStrong: resolveColor(t.markdownStrong ?? t.text ?? fallbackText),
    markdownHorizontalRule: resolveColor(t.markdownHorizontalRule ?? fallbackGray),
    markdownListItem: resolveColor(t.markdownListItem ?? t.syntaxKeyword ?? fallbackGray),
    markdownListEnumeration: resolveColor(t.markdownListEnumeration ?? t.syntaxNumber ?? fallbackGray),
    markdownImage: resolveColor(t.markdownImage ?? t.syntaxString ?? fallbackGray),
    markdownImageText: resolveColor(t.markdownImageText ?? t.primary ?? fallbackGray),
    markdownCodeBlock: resolveColor(t.markdownCodeBlock ?? t.text ?? fallbackText),
  };
}

export function getResolvedTheme(
  name: string,
  mode: "dark" | "light" = "dark",
): ResolvedTheme {
  const themeJson = loadTheme(name);
  return resolveTheme(themeJson, mode);
}

export function getSyntaxTheme(
  name: string,
  mode: "dark" | "light" = "dark",
): SyntaxTheme {
  const resolved = getResolvedTheme(name, mode);

  return {
    // Default text style
    default: { fg: resolved.text },

    // Code syntax styles
    keyword: { fg: resolved.syntaxKeyword, italic: true },
    "keyword.import": { fg: resolved.syntaxKeyword },
    "keyword.return": { fg: resolved.syntaxKeyword, italic: true },
    "keyword.conditional": { fg: resolved.syntaxKeyword, italic: true },
    "keyword.repeat": { fg: resolved.syntaxKeyword, italic: true },
    "keyword.type": { fg: resolved.syntaxType, bold: true, italic: true },
    "keyword.function": { fg: resolved.syntaxFunction },
    "keyword.operator": { fg: resolved.syntaxOperator },
    "keyword.modifier": { fg: resolved.syntaxKeyword, italic: true },
    "keyword.exception": { fg: resolved.syntaxKeyword, italic: true },
    string: { fg: resolved.syntaxString },
    symbol: { fg: resolved.syntaxString },
    comment: { fg: resolved.syntaxComment, italic: true },
    "comment.documentation": { fg: resolved.syntaxComment, italic: true },
    number: { fg: resolved.syntaxNumber },
    boolean: { fg: resolved.syntaxNumber },
    constant: { fg: resolved.syntaxNumber },
    function: { fg: resolved.syntaxFunction },
    "function.call": { fg: resolved.syntaxFunction },
    "function.method": { fg: resolved.syntaxFunction },
    "function.method.call": { fg: resolved.syntaxVariable },
    constructor: { fg: resolved.syntaxFunction },
    type: { fg: resolved.syntaxType },
    module: { fg: resolved.syntaxType },
    class: { fg: resolved.syntaxType },
    operator: { fg: resolved.syntaxOperator },
    variable: { fg: resolved.syntaxVariable },
    "variable.parameter": { fg: resolved.syntaxVariable },
    "variable.member": { fg: resolved.syntaxFunction },
    property: { fg: resolved.syntaxVariable },
    parameter: { fg: resolved.syntaxVariable },
    bracket: { fg: resolved.syntaxPunctuation },
    punctuation: { fg: resolved.syntaxPunctuation },
    "punctuation.bracket": { fg: resolved.syntaxPunctuation },
    "punctuation.delimiter": { fg: resolved.syntaxOperator },
    "punctuation.special": { fg: resolved.syntaxOperator },

    // Markdown styles - these are the Tree-sitter scope names for markdown
    "markup.heading": { fg: resolved.markdownHeading, bold: true },
    "markup.heading.1": { fg: resolved.markdownHeading, bold: true },
    "markup.heading.2": { fg: resolved.markdownHeading, bold: true },
    "markup.heading.3": { fg: resolved.markdownHeading, bold: true },
    "markup.heading.4": { fg: resolved.markdownHeading, bold: true },
    "markup.heading.5": { fg: resolved.markdownHeading, bold: true },
    "markup.heading.6": { fg: resolved.markdownHeading, bold: true },
    "markup.bold": { fg: resolved.markdownStrong, bold: true },
    "markup.strong": { fg: resolved.markdownStrong, bold: true },
    "markup.italic": { fg: resolved.markdownEmph, italic: true },
    "markup.list": { fg: resolved.markdownListItem },
    "markup.quote": { fg: resolved.markdownBlockQuote, italic: true },
    "markup.raw": { fg: resolved.markdownCode },
    "markup.raw.block": { fg: resolved.markdownCode },
    "markup.raw.inline": { fg: resolved.markdownCode },
    "markup.link": { fg: resolved.markdownLink, underline: true },
    "markup.link.label": { fg: resolved.markdownLinkText, underline: true },
    "markup.link.url": { fg: resolved.markdownLink, underline: true },
    label: { fg: resolved.markdownLinkText },
    spell: { fg: resolved.text },
    nospell: { fg: resolved.text },
    conceal: { fg: resolved.conceal || resolved.textMuted },
    "string.special": { fg: resolved.markdownLink, underline: true },
    "string.special.url": { fg: resolved.markdownLink, underline: true },
  };
}

export const themeNames = Object.keys(THEME_FILES).sort();

export const defaultThemeName = "github";

// Helper to convert RGBA to hex string
export function rgbaToHex(rgba: RGBA): string {
  const r = Math.round(rgba.r * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(rgba.g * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(rgba.b * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`;
}
