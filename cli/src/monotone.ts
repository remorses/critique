// Monotone theme generator for creating single-hue color schemes.
// Generates VS Code-compatible themes from a base hue with configurable saturation.
// Used for creating consistent color palettes across light and dark variants.

type VSCodeTheme = {
  name: string;
  type: "light" | "dark";
  colors: Record<string, string>;
  tokenColors: Array<{
    scope: string | string[];
    settings: {
      foreground?: string;
      fontStyle?: string;
    };
  }>;
};

type HSL = {
  h: number;
  s: number;
  l: number;
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h >= 60 && h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h >= 120 && h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h >= 180 && h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h >= 240 && h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function createMonotoneTheme(options: {
  name: string;
  hue: number;
  isDark?: boolean;
  saturation?: number;
  lightnessAdjust?: number;
}): VSCodeTheme {
  const { name, hue, isDark = true, saturation = 0.20, lightnessAdjust = 0 } = options;

  const s = (factor: number) => saturation === 0 ? 0 : saturation * factor;

  const bg = isDark
    ? hslToHex(hue, s(0.75), 0.08 + lightnessAdjust)
    : hslToHex(hue, s(0.50), 0.95 + lightnessAdjust);
  const fg = isDark
    ? hslToHex(hue, s(0.50), 0.85 + lightnessAdjust)
    : hslToHex(hue, s(0.75), 0.15 + lightnessAdjust);

  const shade = (lightness: number, satFactor: number = 1.0) =>
    hslToHex(hue, s(satFactor), lightness);

  return {
    name,
    type: isDark ? "dark" : "light",
    colors: {
      "editor.background": bg,
      "editor.foreground": fg,
      "editorLineNumber.foreground": isDark ? shade(0.30, 0.75) : shade(0.60, 0.75),
      "editorLineNumber.activeForeground": isDark ? shade(0.50, 1.25) : shade(0.40, 1.25),
      "editorCursor.foreground": fg,
      "editor.selectionBackground": isDark ? shade(0.18, 1.25) : shade(0.85, 1.0),
      "editor.lineHighlightBackground": isDark ? shade(0.12, 1.0) : shade(0.92, 0.75),
      "editorIndentGuide.background": isDark ? shade(0.15, 0.75) : shade(0.85, 0.75),
      "editorIndentGuide.activeBackground": isDark ? shade(0.30, 1.25) : shade(0.70, 1.25),
      "editorWhitespace.foreground": isDark ? shade(0.20, 0.75) : shade(0.80, 0.75),
      "sideBar.background": isDark ? shade(0.06, 0.75) : shade(0.97, 0.50),
      "sideBar.foreground": isDark ? shade(0.60, 1.0) : shade(0.35, 1.0),
      "sideBar.border": isDark ? shade(0.12, 1.0) : shade(0.90, 0.75),
      "activityBar.background": isDark ? shade(0.06, 0.75) : shade(0.97, 0.50),
      "activityBar.foreground": isDark ? shade(0.70, 1.25) : shade(0.30, 1.25),
      "activityBar.border": isDark ? shade(0.12, 1.0) : shade(0.90, 0.75),
      "statusBar.background": isDark ? shade(0.06, 0.75) : shade(0.97, 0.50),
      "statusBar.foreground": isDark ? shade(0.60, 1.0) : shade(0.35, 1.0),
      "statusBar.border": isDark ? shade(0.12, 1.0) : shade(0.90, 0.75),
      "titleBar.activeBackground": isDark ? shade(0.06, 0.75) : shade(0.97, 0.50),
      "titleBar.activeForeground": isDark ? shade(0.60, 1.0) : shade(0.35, 1.0),
      "titleBar.border": isDark ? shade(0.12, 1.0) : shade(0.90, 0.75),
      "tab.activeBackground": bg,
      "tab.activeForeground": fg,
      "tab.inactiveBackground": isDark ? shade(0.10, 0.75) : shade(0.93, 0.50),
      "tab.inactiveForeground": isDark ? shade(0.45, 1.0) : shade(0.50, 1.0),
      "tab.border": isDark ? shade(0.12, 1.0) : shade(0.90, 0.75),
      "panel.border": isDark ? shade(0.12, 1.0) : shade(0.90, 0.75),
      "input.background": isDark ? shade(0.10, 0.75) : shade(0.98, 0.50),
      "input.foreground": fg,
      "input.border": isDark ? shade(0.20, 1.0) : shade(0.85, 1.0),
      "dropdown.background": isDark ? shade(0.10, 0.75) : shade(0.98, 0.50),
      "dropdown.foreground": fg,
      "list.activeSelectionBackground": isDark ? shade(0.18, 1.25) : shade(0.85, 1.25),
      "list.activeSelectionForeground": fg,
      "list.hoverBackground": isDark ? shade(0.14, 1.0) : shade(0.90, 0.75),
      "list.focusBackground": isDark ? shade(0.18, 1.25) : shade(0.85, 1.25),
    },
    tokenColors: [
      {
        scope: ["comment", "punctuation.definition.comment"],
        settings: {
          foreground: isDark ? shade(0.45, 1.0) : shade(0.50, 1.25),
          fontStyle: "italic",
        },
      },
      {
        scope: ["keyword", "storage.type", "storage.modifier"],
        settings: {
          foreground: isDark ? shade(0.60, 1.75) : shade(0.35, 2.0),
          fontStyle: "bold",
        },
      },
      {
        scope: ["string", "punctuation.definition.string"],
        settings: {
          foreground: isDark ? shade(0.65, 1.5) : shade(0.40, 1.75),
        },
      },
      {
        scope: ["constant.numeric", "constant.language", "constant.character"],
        settings: {
          foreground: isDark ? shade(0.70, 1.5) : shade(0.35, 1.75),
        },
      },
      {
        scope: ["variable", "entity.name.variable"],
        settings: {
          foreground: isDark ? shade(0.75, 1.0) : shade(0.25, 1.0),
        },
      },
      {
        scope: ["entity.name.function", "support.function"],
        settings: {
          foreground: isDark ? shade(0.80, 1.25) : shade(0.20, 1.5),
        },
      },
      {
        scope: [
          "entity.name.type",
          "entity.name.class",
          "support.type",
          "support.class",
        ],
        settings: {
          foreground: isDark ? shade(0.75, 1.5) : shade(0.25, 1.75),
        },
      },
      {
        scope: "punctuation",
        settings: {
          foreground: isDark ? shade(0.55, 1.0) : shade(0.45, 1.0),
        },
      },
      {
        scope: "operator",
        settings: {
          foreground: isDark ? shade(0.65, 1.25) : shade(0.35, 1.5),
        },
      },
      {
        scope: "entity.name.tag",
        settings: {
          foreground: isDark ? shade(0.70, 1.75) : shade(0.30, 2.0),
        },
      },
      {
        scope: "entity.other.attribute-name",
        settings: {
          foreground: isDark ? shade(0.75, 1.25) : shade(0.25, 1.5),
        },
      },
    ],
  };
}

export function generateMonotoneThemes() {
  return [
    createMonotoneTheme({ name: "monotone-blue-dark", hue: 210, isDark: true }),
    createMonotoneTheme({ name: "monotone-blue-light", hue: 210, isDark: false }),
    createMonotoneTheme({ name: "monotone-green-dark", hue: 120, isDark: true }),
    createMonotoneTheme({ name: "monotone-green-light", hue: 120, isDark: false }),
    createMonotoneTheme({ name: "monotone-purple-dark", hue: 270, isDark: true }),
    createMonotoneTheme({ name: "monotone-purple-light", hue: 270, isDark: false }),
    createMonotoneTheme({ name: "monotone-red-dark", hue: 0, isDark: true }),
    createMonotoneTheme({ name: "monotone-red-light", hue: 0, isDark: false }),
    createMonotoneTheme({ name: "monotone-orange-dark", hue: 30, isDark: true }),
    createMonotoneTheme({ name: "monotone-orange-light", hue: 30, isDark: false }),
    createMonotoneTheme({ name: "monotone-cyan-dark", hue: 180, isDark: true }),
    createMonotoneTheme({ name: "monotone-cyan-light", hue: 180, isDark: false }),
  ];
}

export { createMonotoneTheme };
