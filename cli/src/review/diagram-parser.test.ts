// Tests for diagram parser

import { describe, expect, it } from "bun:test"
import {
  parseDiagram,
  parseDiagramLine,
  diagramToDebugString,
  convertAsciiToUnicode,
} from "./diagram-parser.js"

describe("parseDiagramLine", () => {
  it("should parse empty line", () => {
    expect(parseDiagramLine("")).toMatchInlineSnapshot(`
{
  "segments": [],
}
`)
  })

  it("should parse pure text as text segment", () => {
    expect(parseDiagramLine("Hello World")).toMatchInlineSnapshot(`
{
  "segments": [
    {
      "text": "Hello",
      "type": "text",
    },
    {
      "text": " ",
      "type": "muted",
    },
    {
      "text": "World",
      "type": "text",
    },
  ],
}
`)
  })

  it("should parse box drawing characters as muted", () => {
    expect(parseDiagramLine("┌─────┐")).toMatchInlineSnapshot(`
{
  "segments": [
    {
      "text": "┌─────┐",
      "type": "muted",
    },
  ],
}
`)
  })

  it("should parse mixed box and text", () => {
    expect(parseDiagramLine("│ Client │")).toMatchInlineSnapshot(`
{
  "segments": [
    {
      "text": "│ ",
      "type": "muted",
    },
    {
      "text": "Client",
      "type": "text",
    },
    {
      "text": " │",
      "type": "muted",
    },
  ],
}
`)
  })

  it("should parse arrows as muted", () => {
    expect(parseDiagramLine("A ──▶ B")).toMatchInlineSnapshot(`
{
  "segments": [
    {
      "text": "A",
      "type": "text",
    },
    {
      "text": " ──▶ ",
      "type": "muted",
    },
    {
      "text": "B",
      "type": "text",
    },
  ],
}
`)
  })

  it("should parse ASCII pipes and dashes as muted", () => {
    expect(parseDiagramLine("+---+")).toMatchInlineSnapshot(`
{
  "segments": [
    {
      "text": "+---+",
      "type": "muted",
    },
  ],
}
`)
    expect(parseDiagramLine("| X |")).toMatchInlineSnapshot(`
{
  "segments": [
    {
      "text": "| ",
      "type": "muted",
    },
    {
      "text": "X",
      "type": "text",
    },
    {
      "text": " |",
      "type": "muted",
    },
  ],
}
`)
  })
})

describe("parseDiagram", () => {
  it("should parse simple box diagram", () => {
    const diagram = `┌─────────┐
│  Test   │
└─────────┘`
    expect(parseDiagram(diagram)).toMatchInlineSnapshot(`
[
  {
    "segments": [
      {
        "text": "┌─────────┐",
        "type": "muted",
      },
    ],
  },
  {
    "segments": [
      {
        "text": "│  ",
        "type": "muted",
      },
      {
        "text": "Test",
        "type": "text",
      },
      {
        "text": "   │",
        "type": "muted",
      },
    ],
  },
  {
    "segments": [
      {
        "text": "└─────────┘",
        "type": "muted",
      },
    ],
  },
]
`)
  })

  it("should parse flow diagram with arrows", () => {
    const diagram = `┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘`
    expect(parseDiagram(diagram)).toMatchInlineSnapshot(`
[
  {
    "segments": [
      {
        "text": "┌─────────────┐     ┌─────────────┐     ┌─────────────┐",
        "type": "muted",
      },
    ],
  },
  {
    "segments": [
      {
        "text": "│   ",
        "type": "muted",
      },
      {
        "text": "Client",
        "type": "text",
      },
      {
        "text": "    │────▶│   ",
        "type": "muted",
      },
      {
        "text": "Server",
        "type": "text",
      },
      {
        "text": "    │────▶│  ",
        "type": "muted",
      },
      {
        "text": "Database",
        "type": "text",
      },
      {
        "text": "   │",
        "type": "muted",
      },
    ],
  },
  {
    "segments": [
      {
        "text": "└─────────────┘     └─────────────┘     └─────────────┘",
        "type": "muted",
      },
    ],
  },
]
`)
  })
})

describe("diagramToDebugString", () => {
  it("should replace muted segments with asterisks", () => {
    const diagram = `┌─────────┐
│  Test   │
└─────────┘`
    const parsed = parseDiagram(diagram)
    expect(diagramToDebugString(parsed)).toMatchInlineSnapshot(`
"***********
***Test****
***********"
`)
  })

  it("should show text normally and mute structural chars", () => {
    const diagram = `┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │
└─────────────┘     └─────────────┘`
    const parsed = parseDiagram(diagram)
    expect(diagramToDebugString(parsed)).toMatchInlineSnapshot(`
"***********************************
****Client**************Server*****
***********************************"
`)
  })

  it("should handle vertical flow diagram", () => {
    const diagram = `     ┌─────────┐
     │  Start  │
     └────┬────┘
          │
          ▼
     ┌─────────┐
     │  End    │
     └─────────┘`
    const parsed = parseDiagram(diagram)
    expect(diagramToDebugString(parsed)).toMatchInlineSnapshot(`
"****************
********Start***
****************
***********
***********
****************
********End*****
****************"
`)
  })

  it("should handle complex architecture diagram", () => {
    const diagram = `┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Router    │────▶│  Handler    │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │                   │
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │  Validate   │     │   Check     │     │   Query     │
                    │   Route     │     │   Auth      │     │   Execute   │
                    └─────────────┘     └─────────────┘     └─────────────┘`
    const parsed = parseDiagram(diagram)
    expect(diagramToDebugString(parsed)).toMatchInlineSnapshot(`
"***************************************************************************
****Client**************Router*************Handler*************Database****
***************************************************************************
********************************************************************
********************************************************************
********************************************************************
***************************************************************************
***********************Validate*************Check***************Query******
************************Route***************Auth****************Execute****
***************************************************************************"
`)
  })

  it("should handle ASCII-style diagram", () => {
    const diagram = `+-------+     +-------+
| Input | --> | Output|
+-------+     +-------+`
    const parsed = parseDiagram(diagram)
    expect(diagramToDebugString(parsed)).toMatchInlineSnapshot(`
"***********************
**Input*********Output*
***********************"
`)
  })

  it("should handle diagram with downward arrows", () => {
    const diagram = `  A
  │
  ▼
  B`
    const parsed = parseDiagram(diagram)
    expect(diagramToDebugString(parsed)).toMatchInlineSnapshot(`
"**A
***
***
**B"
`)
  })
})

describe("convertAsciiToUnicode", () => {
  it("should convert | to │ and -- to ──", () => {
    const ascii = `+----+
| Hi |
+----+
  |
  v`
    expect(convertAsciiToUnicode(ascii)).toMatchInlineSnapshot(`
      "+────+
      │ Hi │
      +────+
        │
        v"
    `)
  })

  it("should preserve single hyphen in text like web-render", () => {
    const ascii = `| web-render |`
    expect(convertAsciiToUnicode(ascii)).toMatchInlineSnapshot(`"│ web-render │"`)
  })
})
