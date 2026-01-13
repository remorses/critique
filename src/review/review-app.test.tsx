// Test for ReviewAppView rendering with example YAML data

import { afterEach, describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ReviewAppView } from "./review-app.tsx"
import { createHunk } from "./hunk-parser.ts"
import type { ReviewYaml } from "./types.ts"

// Example hunks using createHunk helper - generates valid rawDiff automatically
const exampleHunks = [
  createHunk(1, "src/utils.ts", 0, 10, 10, [
    " function helper() {",
    "-  return null",
    "+  // Add validation",
    "+  if (!input) return null",
    "+  return process(input)",
    " }",
  ]),
  createHunk(2, "src/utils.ts", 1, 25, 27, [
    " export function main() {",
    "+  const result = helper()",
    "+  console.log(result)",
    "   return result",
    " }",
  ]),
  createHunk(3, "src/index.ts", 0, 1, 1, [
    " import { main } from './utils'",
    "+import { logger } from './logger'",
  ]),
]

// Example review YAML that groups hunks with descriptions
const exampleReviewData: ReviewYaml = {
  hunks: [
    {
      hunkIds: [3],
      markdownDescription: `## Import changes

Added logger import to support new logging functionality.`,
    },
    {
      hunkIds: [1, 2],
      markdownDescription: `## Input validation and logging

These changes add input validation to the helper function and integrate logging in the main function.`,
    },
  ],
}

describe("ReviewAppView", () => {
  let testSetup: Awaited<ReturnType<typeof testRender>>

  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy()
    }
  })

  it("should render review groups with markdown descriptions and hunks", async () => {
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={exampleReviewData}
        currentGroupIndex={0}
        isGenerating={false}
        themeName="github"
        width={80}
      />,
      {
        width: 80,
        height: 30,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
"                                                                                
   Import changes                                                             █ 
                                                                              █ 
   Added logger import to support new logging functionality.                  █ 
                                                                              █ 
  #3 src/index.ts +1-0                                                        █ 
  1   import { main } from './utils'                                          █ 
  2 + import { logger } from './logger'                                       █ 
                                                                              █ 
                                                                              █ 
                                                                              █ 
                                                                              █ 
                                                                              █ 
                                                                              █ 
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
  <- prev                 q quit  j/k navigate  (1/2)                  next ->  
                                                                                
"
`)
  })

  it("should show loading state when no review data", async () => {
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={null}
        currentGroupIndex={0}
        isGenerating={true}
        themeName="github"
        width={60}
      />,
      {
        width: 60,
        height: 10,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
"                                                            
 Analyzing 3 hunks...                                       
 Waiting for AI to generate review...                       
                                                            
                                                            
                                                            
                                                            
                                                            
                                                            
                                                            
"
`)
  })

  it("should show empty state when no hunks in review", async () => {
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={{ hunks: [] }}
        currentGroupIndex={0}
        isGenerating={false}
        themeName="github"
        width={60}
      />,
      {
        width: 60,
        height: 10,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
"                                                            
 No review groups generated                                 
                                                            
                                                            
                                                            
                                                            
                                                            
                                                            
                                                            
                                                            
"
`)
  })

  it("should show second group when navigating", async () => {
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={exampleReviewData}
        currentGroupIndex={1}
        isGenerating={false}
        themeName="github"
        width={80}
      />,
      {
        width: 80,
        height: 35,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
"                                                                                
   Input validation and logging                                               █ 
                                                                              █ 
   These changes add input validation to the helper function and integrate    █ 
   logging in the main function.                                              █ 
                                                                              █ 
  #1 src/utils.ts +3-1                                                        █ 
  10   function helper() {                                                    █ 
  11 -   return null                                                          █ 
  11 +   // Add validation                                                    █ 
  12 +   if (!input) return null                                              █ 
  13 +   return process(input)                                                █ 
  14   }                                                                      █ 
                                                                              █ 
  #2 src/utils.ts +2-0                                                        █ 
  27   export function main() {                                               █ 
  28 +   const result = helper()                                              ▀ 
  29 +   console.log(result)                                                    
  30     return result                                                          
  31   }                                                                        
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
                                                                                
  <- prev                 q quit  j/k navigate  (2/2)                  next ->  
                                                                                
"
`)
  })

  it("should use split view with wide terminal and show centered prose for multiple groups", async () => {
    // Width 160, height 60 - shows split view for hunks with both add/delete
    // Two prose parts to verify centering works for multiple groups
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={exampleReviewData}
        currentGroupIndex={0}
        isGenerating={false}
        themeName="github"
        width={160}
      />,
      {
        width: 160,
        height: 60,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    // First group: hunk #3 (only additions = unified view), prose centered
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                                                                                
                                               Import changes                                                                                                       █ 
                                                                                                                                                                    █ 
                                               Added logger import to support new logging functionality.                                                            █ 
                                                                                                                                                                    █ 
        #3 src/index.ts +1-0                                                                                                                                        █ 
        1   import { main } from './utils'                                                                                                                          █ 
        2 + import { logger } from './logger'                                                                                                                       █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
        <- prev                                                         q quit  j/k navigate  (1/2)                                                          next ->  
                                                                                                                                                                      
      "
    `)
  })

  it("should show split view for second group with mixed hunks", async () => {
    // Second group has hunk #1 (add+delete = split) and hunk #2 (only add = unified)
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={exampleReviewData}
        currentGroupIndex={1}
        isGenerating={false}
        themeName="github"
        width={160}
      />,
      {
        width: 160,
        height: 60,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    // Hunk #1 should be split view (has both add and delete)
    // Hunk #2 should be unified view (only additions)
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                                                                                
                                               Input validation and logging                                                                                         █ 
                                                                                                                                                                    █ 
                                               These changes add input validation to the helper function and integrate                                              █ 
                                               logging in the main function.                                                                                        █ 
                                                                                                                                                                    █ 
        #1 src/utils.ts +3-1                                                                                                                                        █ 
        10   function helper() {                                                       10   function helper() {                                                     █ 
        11 -   return null                                                             11 +   // Add validation                                                     █ 
                                                                                       12 +   if (!input) return null                                               █ 
                                                                                       13 +   return process(input)                                                 █ 
        12   }                                                                         14   }                                                                       █ 
                                                                                                                                                                    █ 
        #2 src/utils.ts +2-0                                                                                                                                        █ 
        27   export function main() {                                                                                                                               █ 
        28 +   const result = helper()                                                                                                                              █ 
        29 +   console.log(result)                                                                                                                                  █ 
        30     return result                                                                                                                                        █ 
        31   }                                                                                                                                                      █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                    █ 
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
                                                                                                                                                                      
        <- prev                                                         q quit  j/k navigate  (2/2)                                                          next ->  
                                                                                                                                                                      
      "
    `)
  })
})
