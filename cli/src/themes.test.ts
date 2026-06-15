import { describe, expect, it } from "bun:test"
import { getResolvedTheme, rgbaToHex, themeNames } from "./themes.js"

describe("themes", () => {
  it("loads catppuccin latte as a selectable light theme", () => {
    expect(themeNames).toContain("catppuccin-latte")

    const theme = getResolvedTheme("catppuccin-latte")

    expect(rgbaToHex(theme.background)).toBe("#eff1f5")
    expect(rgbaToHex(theme.backgroundPanel)).toBe("#e6e9ef")
    expect(rgbaToHex(theme.text)).toBe("#4c4f69")
    expect(rgbaToHex(theme.primary)).toBe("#1e66f5")
  })
})
