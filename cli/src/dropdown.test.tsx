import * as React from "react"
import { afterEach, describe, expect, it } from "bun:test"
import { act } from "react"
import { testRender } from "@opentuah/react/test-utils"
import Dropdown, { filterDropdownOptions } from "./dropdown.js"
import { getResolvedTheme } from "./themes.js"

const themeOptions = [
  { title: "GitHub", value: "github" },
  { title: "Tokyo Night", value: "tokyonight" },
]

function DropdownHarness() {
  const [open, setOpen] = React.useState(true)
  const theme = getResolvedTheme("github")

  if (!open) {
    return <text>closed</text>
  }

  return (
    <Dropdown
      tooltip="Select theme"
      options={themeOptions}
      selectedValues={[]}
      onEscape={() => setOpen(false)}
      theme={theme}
    />
  )
}

// Suppress React act() warnings for opentui input tests.
// opentui's mockInput triggers state updates asynchronously via stdin parsing,
// which inherently happens outside act(). This is expected behavior for TUI
// component testing — not a real problem.
// testRender sets IS_REACT_ACT_ENVIRONMENT=true, so we must disable it after.
async function setupTest(jsx: React.ReactElement, opts: { width: number; height: number }) {
  const setup = await testRender(jsx, opts)
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  return setup
}

describe("Dropdown", () => {
  let testSetup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy()
    }
  })

  it("closes on escape", async () => {
    testSetup = await setupTest(<DropdownHarness />, {
      width: 50,
      height: 12,
    })

    await testSetup.renderOnce()
    let frame = testSetup.captureCharFrame()
    expect(frame).toContain("Select theme")

    // Press escape - emits to stdin which triggers useKeyboard handler
    testSetup.mockInput.pressEscape()
    // Allow stdin event to be parsed and trigger React state update
    await new Promise(r => setTimeout(r, 10))
    // Render the updated state
    await testSetup.renderOnce()
    frame = testSetup.captureCharFrame()
    expect(frame).toContain("closed")
    expect(frame).not.toContain("Select theme")
  })

  it("filters visible options when typing in textarea", async () => {
    testSetup = await setupTest(<DropdownHarness />, {
      width: 50,
      height: 12,
    })

    await testSetup.renderOnce()
    let frame = testSetup.captureCharFrame()
    // Both options visible initially
    expect(frame).toContain("GitHub")
    expect(frame).toContain("Tokyo Night")

    // Type "tokyo" to filter — should hide GitHub and show only Tokyo Night
    await testSetup.mockInput.typeText("tokyo")
    await new Promise(r => setTimeout(r, 50))
    await testSetup.renderOnce()
    frame = testSetup.captureCharFrame()
    expect(frame).toContain("Tokyo Night")
    expect(frame).not.toContain("GitHub")
  })

  it("filters options by title and keyword intersections", () => {
    const options = [
      { title: "GitHub", value: "github", keywords: ["git", "hub"] },
      { title: "Tokyo Night", value: "tokyonight", keywords: ["tokyo", "night"] },
      { title: "Ayu", value: "ayu", keywords: ["light"] },
    ]

    const tokyoOnly = filterDropdownOptions(options, "tokyo")
    expect(tokyoOnly).toMatchInlineSnapshot(`
      [
        {
          "keywords": [
            "tokyo",
            "night",
          ],
          "title": "Tokyo Night",
          "value": "tokyonight",
        },
      ]
    `)

    const intersection = filterDropdownOptions(options, "git hub")
    expect(intersection).toMatchInlineSnapshot(`
      [
        {
          "keywords": [
            "git",
            "hub",
          ],
          "title": "GitHub",
          "value": "github",
        },
      ]
    `)
  })
})
