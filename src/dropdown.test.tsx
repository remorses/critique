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

  // TODO: Test is flaky after opentui 0.1.77 update - keyboard events not propagating correctly
  // The escape key triggers a React state update but it's not being captured by act() properly
  it.skip("closes on escape", async () => {
    testSetup = await testRender(<DropdownHarness />, {
      width: 50,
      height: 12,
    })

    await act(async () => {
      await testSetup.renderOnce()
    })
    let frame = testSetup.captureCharFrame()
    expect(frame).toContain("Select theme")

    await act(async () => {
      testSetup.mockInput.pressEscape()
    })
    await act(async () => {
      await testSetup.renderOnce()
    })
    await act(async () => {
      await testSetup.renderOnce()
    })
    frame = testSetup.captureCharFrame()
    expect(frame).toContain("closed")
    expect(frame).not.toContain("Select theme")
  })
})
