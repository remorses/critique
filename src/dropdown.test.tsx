import * as React from "react"
import { afterEach, describe, expect, it } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import Dropdown, { filterDropdownOptions } from "./dropdown.tsx"
import { getResolvedTheme } from "./themes.ts"

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

describe("Dropdown", () => {
  let testSetup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy()
    }
  })

  it("closes on escape", async () => {
    testSetup = await testRender(<DropdownHarness />, {
      width: 50,
      height: 12,
    })

    await act(async () => {
      await testSetup.renderOnce()
    })
    let frame = testSetup.captureCharFrame()
    expect(frame).toContain("Select theme")

    // Press escape - emits to stdin which triggers useKeyboard handler
    testSetup.mockInput.pressEscape()
    // Allow stdin event to be parsed and trigger React state update
    await new Promise(r => setTimeout(r, 10))
    // Render the updated state
    await act(async () => {
      await testSetup.renderOnce()
    })
    frame = testSetup.captureCharFrame()
    expect(frame).toContain("closed")
    expect(frame).not.toContain("Select theme")
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
