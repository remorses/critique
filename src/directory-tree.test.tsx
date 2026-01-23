// Tests for directory tree building and rendering
// Uses opentui test renderer with captureCharFrame() for visual testing

import { afterEach, describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { buildDirectoryTree, type TreeFileInfo, type TreeNode } from "./directory-tree.ts"
import { DirectoryTreeView } from "./components/directory-tree-view.tsx"

/**
 * Simple component to render tree nodes as text for testing
 */
function TreeRenderer({ nodes }: { nodes: TreeNode[] }) {
  return (
    <box style={{ flexDirection: "column" }}>
      {nodes.map((node, idx) => {
        // Build the line: prefix + connector + path + optional stats
        const statsStr = node.isFile
          ? ` (+${node.additions},-${node.deletions})`
          : ""

        return (
          <text key={idx}>
            {node.prefix}
            {node.connector}
            {node.displayPath}
            {statsStr}
          </text>
        )
      })}
    </box>
  )
}

describe("buildDirectoryTree", () => {
  it("should return empty array for no files", () => {
    const result = buildDirectoryTree([])
    expect(result).toEqual([])
  })

  it("should handle single file at root", () => {
    const files: TreeFileInfo[] = [
      { path: "README.md", status: "modified", additions: 5, deletions: 2 },
    ]
    const result = buildDirectoryTree(files)
    expect(result).toHaveLength(1)
    expect(result[0]!.displayPath).toBe("README.md")
    expect(result[0]!.isFile).toBe(true)
    expect(result[0]!.status).toBe("modified")
  })

  it("should collapse single-child directories", () => {
    const files: TreeFileInfo[] = [
      { path: "src/components/Button.tsx", status: "added", additions: 50, deletions: 0 },
    ]
    const result = buildDirectoryTree(files)
    // Should collapse src/components into one directory node
    expect(result).toHaveLength(2)
    expect(result[0]!.displayPath).toBe("src/components")
    expect(result[0]!.isFile).toBe(false)
    expect(result[1]!.displayPath).toBe("Button.tsx")
    expect(result[1]!.isFile).toBe(true)
  })
})

describe("TreeRenderer visual tests", () => {
  let testSetup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy()
    }
  })

  it("should render single file", async () => {
    const files: TreeFileInfo[] = [
      { path: "package.json", status: "modified", additions: 1, deletions: 1 },
    ]
    const nodes = buildDirectoryTree(files)

    testSetup = await testRender(<TreeRenderer nodes={nodes} />, {
      width: 50,
      height: 5,
    })

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "└── package.json (+1,-1)                          
                                                        
                                                        
                                                        
                                                        
      "
    `)
  })

  it("should render multiple root files", async () => {
    const files: TreeFileInfo[] = [
      { path: "package.json", status: "modified", additions: 1, deletions: 1 },
      { path: "README.md", status: "added", additions: 20, deletions: 0 },
      { path: "tsconfig.json", status: "deleted", additions: 0, deletions: 15 },
    ]
    const nodes = buildDirectoryTree(files)

    testSetup = await testRender(<TreeRenderer nodes={nodes} />, {
      width: 50,
      height: 7,
    })

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "├── package.json (+1,-1)                          
      ├── README.md (+20,-0)                            
      └── tsconfig.json (+0,-15)                        
                                                        
                                                        
                                                        
                                                        
      "
    `)
  })

  it("should render nested directories with proper connectors", async () => {
    const files: TreeFileInfo[] = [
      { path: "src/index.ts", status: "modified", additions: 5, deletions: 2 },
      { path: "src/utils.ts", status: "added", additions: 30, deletions: 0 },
    ]
    const nodes = buildDirectoryTree(files)

    testSetup = await testRender(<TreeRenderer nodes={nodes} />, {
      width: 50,
      height: 7,
    })

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "└── src                                           
          ├── index.ts (+5,-2)                          
          └── utils.ts (+30,-0)                         
                                                        
                                                        
                                                        
                                                        
      "
    `)
  })

  it("should collapse single-child directories", async () => {
    const files: TreeFileInfo[] = [
      { path: "src/components/Button.tsx", status: "added", additions: 50, deletions: 0 },
      { path: "src/components/Input.tsx", status: "added", additions: 40, deletions: 0 },
    ]
    const nodes = buildDirectoryTree(files)

    testSetup = await testRender(<TreeRenderer nodes={nodes} />, {
      width: 50,
      height: 7,
    })

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "└── src/components                                
          ├── Button.tsx (+50,-0)                       
          └── Input.tsx (+40,-0)                        
                                                        
                                                        
                                                        
                                                        
      "
    `)
  })

  it("should render complex nested structure", async () => {
    const files: TreeFileInfo[] = [
      { path: "package.json", status: "modified", additions: 2, deletions: 1, fileIndex: 0 },
      { path: "src/index.ts", status: "modified", additions: 10, deletions: 5, fileIndex: 1 },
      { path: "src/components/Button.tsx", status: "added", additions: 50, deletions: 0, fileIndex: 2 },
      { path: "src/components/Input.tsx", status: "modified", additions: 15, deletions: 8, fileIndex: 3 },
      { path: "src/utils/helpers.ts", status: "deleted", additions: 0, deletions: 30, fileIndex: 4 },
      { path: "tests/index.test.ts", status: "added", additions: 25, deletions: 0, fileIndex: 5 },
    ]
    const nodes = buildDirectoryTree(files)

    testSetup = await testRender(<TreeRenderer nodes={nodes} />, {
      width: 60,
      height: 15,
    })

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "├── package.json (+2,-1)                                    
      ├── src                                                     
      │   ├── index.ts (+10,-5)                                   
      │   ├── components                                          
      │   │   ├── Button.tsx (+50,-0)                             
      │   │   └── Input.tsx (+15,-8)                              
      │   └── utils                                               
      │       └── helpers.ts (+0,-30)                             
      └── tests                                                   
          └── index.test.ts (+25,-0)                              
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
      "
    `)
  })

  it("should handle deeply nested paths with collapse", async () => {
    const files: TreeFileInfo[] = [
      { path: "packages/core/src/lib/utils/helpers.ts", status: "modified", additions: 5, deletions: 3 },
      { path: "packages/core/src/lib/utils/format.ts", status: "added", additions: 20, deletions: 0 },
    ]
    const nodes = buildDirectoryTree(files)

    testSetup = await testRender(<TreeRenderer nodes={nodes} />, {
      width: 60,
      height: 7,
    })

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "└── packages/core/src/lib/utils                             
          ├── helpers.ts (+5,-3)                                  
          └── format.ts (+20,-0)                                  
                                                                  
                                                                  
                                                                  
                                                                  
      "
    `)
  })

  it("should handle sibling directories at different levels", async () => {
    const files: TreeFileInfo[] = [
      { path: "src/api/routes.ts", status: "modified", additions: 10, deletions: 5 },
      { path: "src/api/handlers.ts", status: "added", additions: 30, deletions: 0 },
      { path: "src/db/models.ts", status: "modified", additions: 8, deletions: 2 },
      { path: "lib/utils.ts", status: "added", additions: 15, deletions: 0 },
    ]
    const nodes = buildDirectoryTree(files)

    testSetup = await testRender(<TreeRenderer nodes={nodes} />, {
      width: 60,
      height: 12,
    })

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "├── src                                                     
      │   ├── api                                                 
      │   │   ├── routes.ts (+10,-5)                              
      │   │   └── handlers.ts (+30,-0)                            
      │   └── db                                                  
      │       └── models.ts (+8,-2)                               
      └── lib                                                     
          └── utils.ts (+15,-0)                                   
                                                                  
                                                                  
                                                                  
                                                                  
      "
    `)
  })
})

describe("DirectoryTreeView component", () => {
  let testSetup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy()
    }
  })

  it("should render tree without border", async () => {
    const files: TreeFileInfo[] = [
      { path: "src/index.ts", status: "modified", additions: 5, deletions: 2, fileIndex: 0 },
      { path: "src/utils.ts", status: "added", additions: 30, deletions: 0, fileIndex: 1 },
      { path: "README.md", status: "deleted", additions: 0, deletions: 15, fileIndex: 2 },
    ]

    testSetup = await testRender(
      <DirectoryTreeView files={files} themeName="github" />,
      { width: 60, height: 12 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "                  ├── src                                   
                        │   ├── index.ts (+5,-2)                  
                        │   └── utils.ts (+30)                    
                        └── README.md (-15)                       
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
      "
    `)
  })

  it("should render empty when no files", async () => {
    testSetup = await testRender(
      <DirectoryTreeView files={[]} themeName="github" />,
      { width: 40, height: 5 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    // Should render nothing (DirectoryTreeView returns null for empty)
    expect(frame).toMatchInlineSnapshot(`
      "                                        
                                              
                                              
                                              
                                              
      "
    `)
  })
})
