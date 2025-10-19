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
}): VSCodeTheme {
  const { name, hue, isDark = true, saturation = 0.20 } = options;

  const bg = isDark
    ? hslToHex(hue, saturation * 0.75, 0.08)
    : hslToHex(hue, saturation * 0.50, 0.95);
  const fg = isDark
    ? hslToHex(hue, saturation * 0.50, 0.85)
    : hslToHex(hue, saturation * 0.75, 0.15);

  const shade = (lightness: number, sat: number = saturation) =>
    hslToHex(hue, sat, lightness);

  return {
    name,
    type: isDark ? "dark" : "light",
    colors: {
      "editor.background": bg,
      "editor.foreground": fg,
      "editorLineNumber.foreground": isDark ? shade(0.30, saturation * 0.75) : shade(0.60, saturation * 0.75),
      "editorLineNumber.activeForeground": isDark ? shade(0.50, saturation * 1.25) : shade(0.40, saturation * 1.25),
      "editorCursor.foreground": fg,
      "editor.selectionBackground": isDark ? shade(0.18, 0.25) : shade(0.85, 0.20),
      "editor.lineHighlightBackground": isDark ? shade(0.12, 0.20) : shade(0.92, 0.15),
      "editorIndentGuide.background": isDark ? shade(0.15, 0.15) : shade(0.85, 0.15),
      "editorIndentGuide.activeBackground": isDark ? shade(0.30, 0.25) : shade(0.70, 0.25),
      "editorWhitespace.foreground": isDark ? shade(0.20, 0.15) : shade(0.80, 0.15),
      "sideBar.background": isDark ? shade(0.06, 0.15) : shade(0.97, 0.10),
      "sideBar.foreground": isDark ? shade(0.60, 0.20) : shade(0.35, 0.20),
      "sideBar.border": isDark ? shade(0.12, 0.20) : shade(0.90, 0.15),
      "activityBar.background": isDark ? shade(0.06, 0.15) : shade(0.97, 0.10),
      "activityBar.foreground": isDark ? shade(0.70, 0.25) : shade(0.30, 0.25),
      "activityBar.border": isDark ? shade(0.12, 0.20) : shade(0.90, 0.15),
      "statusBar.background": isDark ? shade(0.06, 0.15) : shade(0.97, 0.10),
      "statusBar.foreground": isDark ? shade(0.60, 0.20) : shade(0.35, 0.20),
      "statusBar.border": isDark ? shade(0.12, 0.20) : shade(0.90, 0.15),
      "titleBar.activeBackground": isDark ? shade(0.06, 0.15) : shade(0.97, 0.10),
      "titleBar.activeForeground": isDark ? shade(0.60, 0.20) : shade(0.35, 0.20),
      "titleBar.border": isDark ? shade(0.12, 0.20) : shade(0.90, 0.15),
      "tab.activeBackground": bg,
      "tab.activeForeground": fg,
      "tab.inactiveBackground": isDark ? shade(0.10, 0.15) : shade(0.93, 0.10),
      "tab.inactiveForeground": isDark ? shade(0.45, 0.20) : shade(0.50, 0.20),
      "tab.border": isDark ? shade(0.12, 0.20) : shade(0.90, 0.15),
      "panel.border": isDark ? shade(0.12, 0.20) : shade(0.90, 0.15),
      "input.background": isDark ? shade(0.10, 0.15) : shade(0.98, 0.10),
      "input.foreground": fg,
      "input.border": isDark ? shade(0.20, 0.20) : shade(0.85, 0.20),
      "dropdown.background": isDark ? shade(0.10, 0.15) : shade(0.98, 0.10),
      "dropdown.foreground": fg,
      "list.activeSelectionBackground": isDark ? shade(0.18, 0.25) : shade(0.85, 0.25),
      "list.activeSelectionForeground": fg,
      "list.hoverBackground": isDark ? shade(0.14, 0.20) : shade(0.90, 0.15),
      "list.focusBackground": isDark ? shade(0.18, 0.25) : shade(0.85, 0.25),
    },
    tokenColors: [
      {
        scope: ["comment", "punctuation.definition.comment"],
        settings: {
          foreground: isDark ? shade(0.45, 0.20) : shade(0.50, 0.25),
          fontStyle: "italic",
        },
      },
      {
        scope: ["keyword", "storage.type", "storage.modifier"],
        settings: {
          foreground: isDark ? shade(0.60, 0.35) : shade(0.35, 0.40),
          fontStyle: "bold",
        },
      },
      {
        scope: ["string", "punctuation.definition.string"],
        settings: {
          foreground: isDark ? shade(0.65, 0.30) : shade(0.40, 0.35),
        },
      },
      {
        scope: ["constant.numeric", "constant.language", "constant.character"],
        settings: {
          foreground: isDark ? shade(0.70, 0.30) : shade(0.35, 0.35),
        },
      },
      {
        scope: ["variable", "entity.name.variable"],
        settings: {
          foreground: isDark ? shade(0.75, 0.20) : shade(0.25, 0.20),
        },
      },
      {
        scope: ["entity.name.function", "support.function"],
        settings: {
          foreground: isDark ? shade(0.80, 0.25) : shade(0.20, 0.30),
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
          foreground: isDark ? shade(0.75, 0.30) : shade(0.25, 0.35),
        },
      },
      {
        scope: "punctuation",
        settings: {
          foreground: isDark ? shade(0.55, 0.20) : shade(0.45, 0.20),
        },
      },
      {
        scope: "operator",
        settings: {
          foreground: isDark ? shade(0.65, 0.25) : shade(0.35, 0.30),
        },
      },
      {
        scope: "entity.name.tag",
        settings: {
          foreground: isDark ? shade(0.70, 0.35) : shade(0.30, 0.40),
        },
      },
      {
        scope: "entity.other.attribute-name",
        settings: {
          foreground: isDark ? shade(0.75, 0.25) : shade(0.25, 0.30),
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
