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

// Extended example with more hunks and richer prose
const extendedHunks = [
  // Error handling
  createHunk(1, "src/errors/index.ts", 0, 1, 1, [
    "+export class NotFoundError extends Error {",
    "+  constructor(message: string) {",
    "+    super(message)",
    "+    this.name = 'NotFoundError'",
    "+  }",
    "+}",
  ]),
  // API endpoint changes
  createHunk(2, "src/api/users.ts", 0, 15, 15, [
    " export async function getUser(id: string) {",
    "-  const user = await db.users.find(id)",
    "-  return user",
    "+  const user = await db.users.find(id)",
    "+  if (!user) {",
    "+    throw new NotFoundError(`User ${id} not found`)",
    "+  }",
    "+  return sanitizeUser(user)",
    " }",
  ]),
  // Configuration changes
  createHunk(3, "src/config/database.ts", 0, 1, 1, [
    " export const dbConfig = {",
    "-  host: 'localhost',",
    "-  port: 5432,",
    "+  host: process.env.DB_HOST || 'localhost',",
    "+  port: parseInt(process.env.DB_PORT || '5432'),",
    "+  ssl: process.env.NODE_ENV === 'production',",
    "   database: 'myapp',",
    " }",
  ]),
]

// Rich prose descriptions with multiple paragraphs and formatting
const extendedReviewData: ReviewYaml = {
  hunks: [
    {
      hunkIds: [1],
      markdownDescription: `## Custom Error Classes

Introduces a new error class for better error handling:

- **NotFoundError**: Used when a requested resource doesn't exist

This enables more specific catch blocks and better error messages.`,
    },
    {
      hunkIds: [2],
      markdownDescription: `## User API Improvements

### Error Handling
The getUser function now properly handles missing users by throwing a NotFoundError.

### Security
User data is now sanitized before being returned to prevent leaking sensitive fields.`,
    },
    {
      hunkIds: [3],
      markdownDescription: `## Environment-based Configuration

Database configuration now reads from environment variables:

- **DB_HOST**: Database hostname (default: localhost)
- **DB_PORT**: Database port (default: 5432)
- **SSL**: Automatically enabled in production`,
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

  it("should render all groups: markdown, diffs, markdown, diffs", async () => {
    // Shows both groups in sequence: prose -> diff -> prose -> diff
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={exampleReviewData}
        isGenerating={false}
        themeName="github"
        width={100}
      />,
      {
        width: 100,
        height: 45,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                    
                 Import changes                                                                         █ 
                                                                                                        █ 
                 Added logger import to support new logging functionality.                              █ 
                                                                                                        █ 
        #3 src/index.ts +1-0                                                                            █ 
        1   import { main } from './utils'                                                              █ 
        2 + import { logger } from './logger'                                                           █ 
                                                                                                        █ 
                                                                                                        █ 
                 Input validation and logging                                                           █ 
                                                                                                        █ 
                 These changes add input validation to the helper function and integrate                █ 
                 logging in the main function.                                                          █ 
                                                                                                        █ 
        #1 src/utils.ts +3-1                                                                            █ 
        10   function helper() {                         10   function helper() {                       █ 
        11 -   return null                               11 +   // Add validation                       █ 
                                                         12 +   if (!input) return null                 █ 
                                                         13 +   return process(input)                   █ 
        12   }                                           14   }                                         █ 
                                                                                                        ▀ 
        #2 src/utils.ts +2-0                                                                              
        27   export function main() {                                                                     
        28 +   const result = helper()                                                                    
        29 +   console.log(result)                                                                        
        30     return result                                                                              
        31   }                                                                                            
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                        q quit  j/k scroll  (2 sections)                                  
                                                                                                          
      "
    `)
  })

  it("should show loading state when no review data", async () => {
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={null}
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

  it("should show split view for hunks with both additions and deletions", async () => {
    // Wide terminal triggers split view for mixed hunks
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={exampleReviewData}
        isGenerating={false}
        themeName="github"
        width={140}
      />,
      {
        width: 140,
        height: 50,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                                                            
                                     Import changes                                                                                             █ 
                                                                                                                                                █ 
                                     Added logger import to support new logging functionality.                                                  █ 
                                                                                                                                                █ 
        #3 src/index.ts +1-0                                                                                                                    █ 
        1   import { main } from './utils'                                                                                                      █ 
        2 + import { logger } from './logger'                                                                                                   █ 
                                                                                                                                                █ 
                                                                                                                                                █ 
                                     Input validation and logging                                                                               █ 
                                                                                                                                                █ 
                                     These changes add input validation to the helper function and integrate                                    █ 
                                     logging in the main function.                                                                              █ 
                                                                                                                                                █ 
        #1 src/utils.ts +3-1                                                                                                                    █ 
        10   function helper() {                                             10   function helper() {                                           █ 
        11 -   return null                                                   11 +   // Add validation                                           █ 
                                                                             12 +   if (!input) return null                                     █ 
                                                                             13 +   return process(input)                                       █ 
        12   }                                                               14   }                                                             █ 
                                                                                                                                                █ 
        #2 src/utils.ts +2-0                                                                                                                    █ 
        27   export function main() {                                                                                                           █ 
        28 +   const result = helper()                                                                                                            
        29 +   console.log(result)                                                                                                                
        30     return result                                                                                                                      
        31   }                                                                                                                                    
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                            q quit  j/k scroll  (2 sections)                                                      
                                                                                                                                                  
      "
    `)
  })

  it("should render extended example with multiple prose sections and diffs", async () => {
    // Shows: Error Classes prose -> diff -> API prose -> diff -> Config prose -> diff
    testSetup = await testRender(
      <ReviewAppView
        hunks={extendedHunks}
        reviewData={extendedReviewData}
        isGenerating={false}
        themeName="github"
        width={140}
      />,
      {
        width: 140,
        height: 70,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                                                            
                                     Custom Error Classes                                                                                       █ 
                                                                                                                                                █ 
                                     Introduces a new error class for better error handling:                                                    █ 
                                                                                                                                                █ 
                                     - **NotFoundError**: Used when a requested resource doesn't exist                                          █ 
                                                                                                                                                █ 
                                     This enables more specific catch blocks and better error messages.                                         █ 
                                                                                                                                                █ 
        #1 src/errors/index.ts +6-0                                                                                                             █ 
        1 + export class NotFoundError extends Error {                                                                                          █ 
        2 +   constructor(message: string) {                                                                                                    █ 
        3 +     super(message)                                                                                                                  █ 
        4 +     this.name = 'NotFoundError'                                                                                                     █ 
        5 +   }                                                                                                                                 █ 
        6 + }                                                                                                                                   █ 
                                                                                                                                                █ 
                                                                                                                                                █ 
                                     User API Improvements                                                                                      █ 
                                                                                                                                                █ 
                                     ### Error Handling                                                                                         █ 
                                     The getUser function now properly handles missing users by throwing a                                      █ 
                                     NotFoundError.                                                                                             █ 
                                                                                                                                                █ 
                                     ### Security                                                                                               █ 
                                     User data is now sanitized before being returned to prevent leaking sensitive                              █ 
                                     fields.                                                                                                    █ 
                                                                                                                                                █ 
        #2 src/api/users.ts +5-2                                                                                                                █ 
        15   export async function getUser(id: string) {                     15   export async function getUser(id: string) {                   █ 
        16 -   const user = await db.users.find(id)                          16 +   const user = await db.users.find(id)                        █ 
        17 -   return user                                                   17 +   if (!user) {                                                █ 
                                                                             18 +     throw new NotFoundError(\`User \${id} not found\`)           █ 
                                                                             19 +   }                                                           █ 
                                                                             20 +   return sanitizeUser(user)                                     
        18   }                                                               21   }                                                               
                                                                                                                                                  
                                                                                                                                                  
                                     Environment-based Configuration                                                                              
                                                                                                                                                  
                                     Database configuration now reads from environment variables:                                                 
                                                                                                                                                  
                                     - **DB_HOST**: Database hostname (default: localhost)                                                        
                                     - **DB_PORT**: Database port (default: 5432)                                                                 
                                     - **SSL**: Automatically enabled in production                                                               
                                                                                                                                                  
        #3 src/config/database.ts +3-2                                                                                                            
        1   export const dbConfig = {                                        1   export const dbConfig = {                                        
        2 -   host: 'localhost',                                             2 +   host: process.env.DB_HOST || 'localhost',                      
        3 -   port: 5432,                                                    3 +   port: parseInt(process.env.DB_PORT || '5432'),                 
                                                                             4 +   ssl: process.env.NODE_ENV === 'production',                    
        4     database: 'myapp',                                             5     database: 'myapp',                                             
        5   }                                                                6   }                                                                
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                            q quit  j/k scroll  (3 sections)                                                      
                                                                                                                                                  
      "
    `)
  })
})
