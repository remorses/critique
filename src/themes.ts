// Syntax highlighting themes for critique
// Source: https://github.com/sst/opencode/tree/main/packages/opencode/src/cli/cmd/tui/context/theme

import { parseColor, RGBA } from "@opentui/core";

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
  // Diff colors
  diffAddedBg: RGBA;
  diffRemovedBg: RGBA;
  diffContextBg: RGBA;
  diffAddedLineNumberBg: RGBA;
  diffRemovedLineNumberBg: RGBA;
  diffLineNumber: RGBA;
  // Background
  background: RGBA;
  backgroundPanel: RGBA;
}

export interface SyntaxThemeStyle {
  fg: RGBA;
  bold?: boolean;
  italic?: boolean;
}

export interface SyntaxTheme {
  [key: string]: SyntaxThemeStyle;
  keyword: SyntaxThemeStyle;
  "keyword.import": SyntaxThemeStyle;
  string: SyntaxThemeStyle;
  comment: SyntaxThemeStyle;
  number: SyntaxThemeStyle;
  boolean: SyntaxThemeStyle;
  constant: SyntaxThemeStyle;
  function: SyntaxThemeStyle;
  "function.call": SyntaxThemeStyle;
  constructor: SyntaxThemeStyle;
  type: SyntaxThemeStyle;
  operator: SyntaxThemeStyle;
  variable: SyntaxThemeStyle;
  property: SyntaxThemeStyle;
  bracket: SyntaxThemeStyle;
  punctuation: SyntaxThemeStyle;
  default: SyntaxThemeStyle;
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
    const themePath = new URL(`./themes/${fileName}`, import.meta.url).pathname;
    // Read file synchronously using Node fs (works in Bun)
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

  return {
    primary: resolveColor(t.primary ?? t.syntaxFunction ?? fallbackGray),
    syntaxComment: resolveColor(t.syntaxComment ?? fallbackGray),
    syntaxKeyword: resolveColor(t.syntaxKeyword ?? fallbackGray),
    syntaxFunction: resolveColor(t.syntaxFunction ?? fallbackGray),
    syntaxVariable: resolveColor(t.syntaxVariable ?? fallbackGray),
    syntaxString: resolveColor(t.syntaxString ?? fallbackGray),
    syntaxNumber: resolveColor(t.syntaxNumber ?? fallbackGray),
    syntaxType: resolveColor(t.syntaxType ?? fallbackGray),
    syntaxOperator: resolveColor(t.syntaxOperator ?? fallbackGray),
    syntaxPunctuation: resolveColor(t.syntaxPunctuation ?? fallbackGray),
    text: resolveColor(t.text ?? fallbackText),
    textMuted: resolveColor(t.textMuted ?? fallbackGray),
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
    keyword: { fg: resolved.syntaxKeyword, bold: true },
    "keyword.import": { fg: resolved.syntaxKeyword, bold: true },
    string: { fg: resolved.syntaxString },
    comment: { fg: resolved.syntaxComment, italic: true },
    number: { fg: resolved.syntaxNumber },
    boolean: { fg: resolved.syntaxNumber },
    constant: { fg: resolved.syntaxNumber },
    function: { fg: resolved.syntaxFunction },
    "function.call": { fg: resolved.syntaxFunction },
    constructor: { fg: resolved.syntaxType },
    type: { fg: resolved.syntaxType },
    operator: { fg: resolved.syntaxOperator },
    variable: { fg: resolved.syntaxVariable },
    property: { fg: resolved.syntaxVariable },
    bracket: { fg: resolved.syntaxPunctuation },
    punctuation: { fg: resolved.syntaxPunctuation },
    default: { fg: resolved.text },
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
