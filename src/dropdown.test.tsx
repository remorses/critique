import * as React from "react"
import { afterEach, describe, expect, it } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import Dropdown from "./dropdown.tsx"
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
      kittyKeyboard: true,
    })

    await act(async () => {
      await testSetup.renderOnce()
    })
    let frame = testSetup.captureCharFrame()
    expect(frame).toContain("Select theme")

    await act(async () => {
      testSetup.mockInput.pressEscape()
      await testSetup.renderOnce()
      await testSetup.renderOnce()
    })
    frame = testSetup.captureCharFrame()
    expect(frame).toContain("closed")
    expect(frame).not.toContain("Select theme")
  })
})
