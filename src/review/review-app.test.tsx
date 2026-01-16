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

// Large hunk that can be split into parts
const largeHunk = createHunk(1, "src/api/handlers.ts", 0, 10, 10, [
  " export async function handleRequest(req: Request) {",
  "-  const data = req.body",
  "+  // Input validation",
  "+  if (!req.body) {",
  "+    throw new ValidationError('Request body is required')",
  "+  }",
  "+  const data = validateInput(req.body)",
  " ",
  "   // Process the request",
  "-  const result = process(data)",
  "+  const result = await processAsync(data)",
  "+  ",
  "+  // Logging",
  "+  logger.info('Request processed', { requestId: req.id })",
  " ",
  "   return result",
  " }",
])

// Review data that splits the large hunk into two parts
const partialHunkReviewData: ReviewYaml = {
  hunks: [
    {
      // First part: lines 1-7 (1-based) - validation changes
      hunkId: 1,
      lineRange: [1, 7],
      markdownDescription: `## Input Validation

Added proper input validation at the start of the handler:
- Check for missing request body
- Validate input before processing`,
    },
    {
      // Second part: lines 8-16 (1-based) - processing and logging
      hunkId: 1,
      lineRange: [8, 16],
      markdownDescription: `## Async Processing and Logging

Improved the processing logic:
- Made process call async for better performance
- Added request logging for debugging`,
    },
  ],
}

// Mix of full hunks and partial hunks
const mixedHunkReviewData: ReviewYaml = {
  hunks: [
    {
      // Full hunk using hunkIds
      hunkIds: [3],
      markdownDescription: `## Import changes

Added logger import.`,
    },
    {
      // Partial hunk - just the validation part
      hunkId: 1,
      lineRange: [1, 7],
      markdownDescription: `## Validation

Input validation logic.`,
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
                 Import changes                                                                           
                                                                                                          
                 Added logger import to support new logging functionality.                                
                                                                                                          
                                                                                                          
       rc/index.ts +1-0                                                                                   
                                                                                                          
          import { main } from './utils'                                                                  
        + import { logger } from './logger'                                                               
                                                                                                          
                                                                                                          
                 Input validation and logging                                                             
                                                                                                          
                 These changes add input validation to the helper function and integrate                  
                 logging in the main function.                                                            
                                                                                                          
                                                                                                          
        src/utils.ts +3-1                                                                                 
                                                                                                          
        10   function helper() {                         10   function helper() {                         
        11 -   return null                               11 +   // Add validation                         
                                                         12 +   if (!input) return null                   
                                                         13 +   return process(input)                     
        12   }                                           14   }                                           
                                                                                                          
       c/utils.ts +2-0                                                                                    
                                                                                                          
          export function main() {                                                                        
        +   const result = helper()                                                                       
        +   console.log(result)                                                                           
            return result                                                                                 
          }                                                                                               
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
        (2 sections)  t theme                                      run with --web to share & collaborate  
                                                                                                          
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
       Loading review...                                          
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
                                                                  
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
                                     Import changes                                                                                               
                                                                                                                                                  
                                     Added logger import to support new logging functionality.                                                    
                                                                                                                                                  
                                                                                                                                                  
       rc/index.ts +1-0                                                                                                                           
                                                                                                                                                  
          import { main } from './utils'                                                                                                          
        + import { logger } from './logger'                                                                                                       
                                                                                                                                                  
                                                                                                                                                  
                                     Input validation and logging                                                                                 
                                                                                                                                                  
                                     These changes add input validation to the helper function and integrate                                      
                                     logging in the main function.                                                                                
                                                                                                                                                  
                                                                                                                                                  
        src/utils.ts +3-1                                                                                                                         
                                                                                                                                                  
        10   function helper() {                                             10   function helper() {                                             
        11 -   return null                                                   11 +   // Add validation                                             
                                                                             12 +   if (!input) return null                                       
                                                                             13 +   return process(input)                                         
        12   }                                                               14   }                                                               
                                                                                                                                                  
       c/utils.ts +2-0                                                                                                                            
                                                                                                                                                  
          export function main() {                                                                                                                
        +   const result = helper()                                                                                                               
        +   console.log(result)                                                                                                                   
            return result                                                                                                                         
          }                                                                                                                                       
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
        (2 sections)  t theme                                                                              run with --web to share & collaborate  
                                                                                                                                                  
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
                                     Custom Error Classes                                                                                         
                                                                                                                                                  
                                     Introduces a new error class for better error handling:                                                      
                                                                                                                                                  
                                     - NotFoundError: Used when a requested resource doesn't exist                                                
                                                                                                                                                  
                                                                                                                                                  
                                     This enables more specific catch blocks and better error messages.                                           
                                                                                                                                                  
                                                                                                                                                  
       rc/errors/index.ts +6-0                                                                                                                    
                                                                                                                                                  
        + export class NotFoundError extends Error {                                                                                              
        +   constructor(message: string) {                                                                                                        
        +     super(message)                                                                                                                      
        +     this.name = 'NotFoundError'                                                                                                         
        +   }                                                                                                                                     
        + }                                                                                                                                       
                                                                                                                                                  
                                                                                                                                                  
                                     User API Improvements                                                                                        
                                                                                                                                                  
                                     Error Handling                                                                                               
                                                                                                                                                  
                                     The getUser function now properly handles missing users by throwing a                                        
                                     NotFoundError.                                                                                               
                                                                                                                                                  
                                     Security                                                                                                     
                                                                                                                                                  
                                     User data is now sanitized before being returned to prevent leaking sensitive                                
                                     fields.                                                                                                      
                                                                                                                                                  
                                                                                                                                                  
        src/api/users.ts +5-2                                                                                                                     
                                                                                                                                                  
        15   export async function getUser(id: string) {                     15   export async function getUser(id: string) {                     
        16 -   const user = await db.users.find(id)                          16 +   const user = await db.users.find(id)                          
        17 -   return user                                                   17 +   if (!user) {                                                  
                                                                             18 +     throw new NotFoundError(\`User \${id} not found\`)             
                                                                             19 +   }                                                             
                                                                             20 +   return sanitizeUser(user)                                     
        18   }                                                               21   }                                                               
                                                                                                                                                  
                                                                                                                                                  
                                     Environment-based Configuration                                                                              
                                                                                                                                                  
                                     Database configuration now reads from environment variables:                                                 
                                                                                                                                                  
                                     - DB_HOST: Database hostname (default: localhost)                                                            
                                     - DB_PORT: Database port (default: 5432)                                                                     
                                     - SSL: Automatically enabled in production                                                                   
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
        src/config/database.ts +3-2                                                                                                               
                                                                                                                                                  
        1   export const dbConfig = {                                        1   export const dbConfig = {                                        
        2 -   host: 'localhost',                                             2 +   host: process.env.DB_HOST || 'localhost',                      
        3 -   port: 5432,                                                    3 +   port: parseInt(process.env.DB_PORT || '5432'),                 
                                                                             4 +   ssl: process.env.NODE_ENV === 'production',                    
        4     database: 'myapp',                                             5     database: 'myapp',                                             
        5   }                                                                6   }                                                                
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
        (3 sections)  t theme                                                                              run with --web to share & collaborate  
                                                                                                                                                  
      "
    `)
  })

  it("should render partial hunk - first part only", async () => {
    // Test splitting a hunk - show only lines 1-7 (validation part)
    testSetup = await testRender(
      <ReviewAppView
        hunks={[largeHunk]}
        reviewData={{
          hunks: [{
            hunkId: 1,
            lineRange: [1, 7],
            markdownDescription: `## Input Validation

Added validation at handler start.`,
          }],
        }}
        isGenerating={false}
        themeName="github"
        width={100}
      />,
      {
        width: 100,
        height: 25,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    // Should only show lines 1-7 of the hunk, not the full thing
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                    
                 Input Validation                                                                         
                                                                                                          
                 Added validation at handler start.                                                       
                                                                                                          
                                                                                                          
        src/api/handlers.ts +5-1                                                                          
                                                                                                          
        10   export async function handleRequest(req:    10   export async function handleRequest(req:    
             Request) {                                       Request) {                                  
        11 -   const data = req.body                     11 +   // Input validation                       
                                                         12 +   if (!req.body) {                          
                                                         13 +     throw new ValidationError('Request      
                                                              body is required')                          
                                                         14 +   }                                         
                                                         15 +   const data = validateInput(req.body)      
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
        (1 section)  t theme                                       run with --web to share & collaborate  
                                                                                                          
      "
    `)
  })

  it("should render same hunk split into two parts with different descriptions", async () => {
    // Test: same hunk appears twice with different line ranges and descriptions
    testSetup = await testRender(
      <ReviewAppView
        hunks={[largeHunk]}
        reviewData={partialHunkReviewData}
        isGenerating={false}
        themeName="github"
        width={120}
      />,
      {
        width: 120,
        height: 50,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    // Should show two sections: validation (lines 1-7) then processing (lines 8-16)
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                                        
                           Input Validation                                                                                   
                                                                                                                              
                           Added proper input validation at the start of the handler:                                         
                                                                                                                              
                           - Check for missing request body                                                                   
                           - Validate input before processing                                                                 
                                                                                                                              
                                                                                                                              
                                                                                                                              
        src/api/handlers.ts +5-1                                                                                              
                                                                                                                              
        10   export async function handleRequest(req: Request) {   10   export async function handleRequest(req: Request) {   
        11 -   const data = req.body                               11 +   // Input validation                                 
                                                                   12 +   if (!req.body) {                                    
                                                                   13 +     throw new ValidationError('Request body is        
                                                                        required')                                            
                                                                   14 +   }                                                   
                                                                   15 +   const data = validateInput(req.body)                
                                                                                                                              
                                                                                                                              
                           Async Processing and Logging                                                                       
                                                                                                                              
                           Improved the processing logic:                                                                     
                                                                                                                              
                           - Made process call async for better performance                                                   
                           - Added request logging for debugging                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
        src/api/handlers.ts +4-1                                                                                              
                                                                                                                              
        12                                                         16                                                         
        13     // Process the request                              17     // Process the request                              
        14 -   const result = process(data)                        18 +   const result = await processAsync(data)             
                                                                   19 +                                                       
                                                                   20 +   // Logging                                          
                                                                   21 +   logger.info('Request processed', { requestId: req.  
        15                                                              id })                                                 
        16     return result                                       22                                                         
                                                                   23     return result                                       
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
        (2 sections)  t theme                                                          run with --web to share & collaborate  
                                                                                                                              
      "
    `)
  })

  it("should render mix of full hunks and partial hunks", async () => {
    // Combine full hunk (hunkIds) with partial hunk (hunkId + lineRange)
    testSetup = await testRender(
      <ReviewAppView
        hunks={[...exampleHunks, largeHunk]}
        reviewData={mixedHunkReviewData}
        isGenerating={false}
        themeName="github"
        width={100}
      />,
      {
        width: 100,
        height: 35,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    // Should show: full hunk #3, then partial of largeHunk (lines 1-7)
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                    
                 Import changes                                                                           
                                                                                                          
                 Added logger import.                                                                     
                                                                                                          
                                                                                                          
       rc/index.ts +1-0                                                                                   
                                                                                                          
          import { main } from './utils'                                                                  
        + import { logger } from './logger'                                                               
                                                                                                          
                                                                                                          
                 Validation                                                                               
                                                                                                          
                 Input validation logic.                                                                  
                                                                                                          
                                                                                                          
        src/api/handlers.ts +5-1                                                                          
                                                                                                          
        10   export async function handleRequest(req:    10   export async function handleRequest(req:    
             Request) {                                       Request) {                                  
        11 -   const data = req.body                     11 +   // Input validation                       
                                                         12 +   if (!req.body) {                          
                                                         13 +     throw new ValidationError('Request      
                                                              body is required')                          
                                                         14 +   }                                         
                                                         15 +   const data = validateInput(req.body)      
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
        (2 sections)  t theme                                      run with --web to share & collaborate  
                                                                                                          
      "
    `)
  })

  it("should handle single hunkId without lineRange as full hunk", async () => {
    // hunkId without lineRange should show entire hunk
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={{
          hunks: [{
            hunkId: 1,
            // No lineRange - should show full hunk
            markdownDescription: `## Full hunk via hunkId

This uses hunkId instead of hunkIds but shows full hunk.`,
          }],
        }}
        isGenerating={false}
        themeName="github"
        width={100}
      />,
      {
        width: 100,
        height: 25,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    // Should show full hunk #1
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                    
                 Full hunk via hunkId                                                                     
                                                                                                          
                 This uses hunkId instead of hunkIds but shows full hunk.                                 
                                                                                                          
                                                                                                          
        src/utils.ts +3-1                                                                                 
                                                                                                          
        10   function helper() {                         10   function helper() {                         
        11 -   return null                               11 +   // Add validation                         
                                                         12 +   if (!input) return null                   
                                                         13 +   return process(input)                     
        12   }                                           14   }                                           
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
        (1 section)  t theme                                       run with --web to share & collaborate  
                                                                                                          
      "
    `)
  })

  it("should render wide code blocks and tables centered with variable width", async () => {
    // Test that code blocks and tables are centered but can use full width
    // This test passes the renderer to enable variable-width markdown
    const wideHunk = createHunk(1, "src/config.ts", 0, 1, 1, [
      "+export const config = {",
      "+  host: 'localhost',",
      "+}",
    ])

    const wideReviewData: ReviewYaml = {
      hunks: [{
        hunkIds: [1],
        markdownDescription: `## Configuration with Wide Content

Here's a configuration table:

| Setting | Environment Variable | Default Value | Description |
|---------|---------------------|---------------|-------------|
| Host | DB_HOST | localhost | Database host |
| Port | DB_PORT | 5432 | Database port |
| SSL | DB_SSL | false | Enable SSL |
| Pool | DB_POOL_SIZE | 10 | Connection pool |

And a diagram:

\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
\`\`\`

The prose above stays narrow.`,
      }],
    }

    // First create testSetup to get the renderer
    testSetup = await testRender(
      <ReviewAppView
        hunks={[wideHunk]}
        reviewData={wideReviewData}
        isGenerating={false}
        themeName="github"
        width={120}
      />,
      {
        width: 120,
        height: 35,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                                        
                           Configuration with Wide Content                                                                  █ 
                                                                                                                            █ 
                           Here's a configuration table:                                                                    █ 
                                                                                                                            █ 
                           ┌─────────┬──────────────────────┬───────────────┬─────────────────┐                             █ 
                           │Setting  │Environment Variable  │Default Value  │Description      │                             █ 
                           │─────────│──────────────────────│───────────────│─────────────────│                             █ 
                           │Host     │DB_HOST               │localhost      │Database host    │                             █ 
                           │─────────│──────────────────────│───────────────│─────────────────│                             █ 
                           │Port     │DB_PORT               │5432           │Database port    │                             █ 
                           │─────────│──────────────────────│───────────────│─────────────────│                               
                           │SSL      │DB_SSL                │false          │Enable SSL       │                               
                           │─────────│──────────────────────│───────────────│─────────────────│                               
                           │Pool     │DB_POOL_SIZE          │10             │Connection pool  │                               
                           └─────────┴──────────────────────┴───────────────┴─────────────────┘                               
                                                                                                                              
                           And a diagram:                                                                                     
                                                                                                                              
                           ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                                            
                           │   Client    │────▶│   Server    │────▶│  Database   │                                            
                           └─────────────┘     └─────────────┘     └─────────────┘                                            
                                                                                                                              
                           The prose above stays narrow.                                                                      
                                                                                                                              
                                                                                                                              
       rc/config.ts +3-0                                                                                                      
                                                                                                                              
        + export const config = {                                                                                             
        +   host: 'localhost',                                                                                                
        + }                                                                                                                   
                                                                                                                              
                                                                                                                              
        (1 section)  t theme                                                           run with --web to share & collaborate  
                                                                                                                              
      "
    `)
  })

  it("should render code blocks with wrapMode none - wide content extends beyond viewport", async () => {
    // Test that code blocks use wrapMode: "none" so content doesn't soft-wrap
    // Note: In a terminal, content wider than the viewport will wrap at the buffer edge,
    // but the CodeRenderable itself won't break lines mid-word/mid-line.
    // This test verifies the code block renders and the first visible portion is correct.
    const narrowHunk = createHunk(1, "src/config.ts", 0, 1, 1, [
      "+export const x = 1",
    ])

    const narrowReviewData: ReviewYaml = {
      hunks: [{
        hunkIds: [1],
        markdownDescription: `## Architecture Diagram

Here's how it works:

\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
\`\`\`

The diagram above should not wrap.`,
      }],
    }

    // Render with narrow width - diagram is ~65 chars wide
    testSetup = await testRender(
      <ReviewAppView
        hunks={[narrowHunk]}
        reviewData={narrowReviewData}
        isGenerating={false}
        themeName="github"
        width={80}
      />,
      {
        width: 80,
        height: 25,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    // With 80-char width, the 65-char diagram should fit without wrapping
    expect(frame).toContain("┌─────────────┐     ┌─────────────┐     ┌─────────────┐")
    expect(frame).toContain("│   Client    │────▶│   Server    │────▶│  Database   │")
    expect(frame).toContain("└─────────────┘     └─────────────┘     └─────────────┘")
  })

  it("should WRAP 4-box diagram at 70 cols WITHOUT renderer", async () => {
    // Without renderer, default markdown wrapMode: "word" causes wrapping
    const diagramHunk = createHunk(1, "src/config.ts", 0, 1, 1, [
      "+export const x = 1",
    ])

    const diagramReviewData: ReviewYaml = {
      hunks: [{
        hunkIds: [1],
        markdownDescription: `## Architecture

\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Router    │────▶│  Handler    │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
\`\`\`
`,
      }],
    }

    // Render WITHOUT renderer - uses default markdown rendering
    testSetup = await testRender(
      <ReviewAppView
        hunks={[diagramHunk]}
        reviewData={diagramReviewData}
        isGenerating={false}
        themeName="github"
        width={70}
      />,
      { width: 70, height: 25 },
    )

    await testSetup.renderOnce()
    expect(testSetup.captureCharFrame()).toMatchInlineSnapshot(`
      "                                                                      
         Architecture                                                       
                                                                            
         ┌─────────────┐     ┌─────────────┐     ┌─────────────┐            
           ┌─────────────┐                                                  
         │   Client    │────▶│   Router    │────▶│  Handler    │────▶│      
           Database   │                                                     
         └─────────────┘     └─────────────┘     └─────────────┘            
           └─────────────┘                                                  
                                                                            
                                                                            
       rc/config.ts +1-0                                                    
                                                                            
        + export const x = 1                                                
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
        (1 section)  t theme         run with --web to share & collaborate  
                                                                            
      "
    `)
  })

  // SKIPPED: This test has a pre-existing issue with yoga-layout binding errors
  // when reusing renderers across testRender calls
  it("should TRUNCATE 4-box diagram at 70 cols WITH renderer", async () => {
    // 4-box diagram is 79 chars wide, at 70 cols it truncates (not wraps)
    // This proves wrapMode: "none" is working
    const diagramHunk = createHunk(1, "src/config.ts", 0, 1, 1, [
      "+export const x = 1",
    ])

    const diagramReviewData: ReviewYaml = {
      hunks: [{
        hunkIds: [1],
        markdownDescription: `## Architecture

\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Router    │────▶│  Handler    │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
\`\`\`
`,
      }],
    }

    // First render to get renderer
    testSetup = await testRender(
      <ReviewAppView
        hunks={[diagramHunk]}
        reviewData={diagramReviewData}
        isGenerating={false}
        themeName="github"
        width={70}
      />,
      { width: 70, height: 25 },
    )
    const rendererCtx = testSetup.renderer

    // Re-render with renderer
    testSetup = await testRender(
      <ReviewAppView
        hunks={[diagramHunk]}
        reviewData={diagramReviewData}
        isGenerating={false}
        themeName="github"
        width={70}
        renderer={rendererCtx}
      />,
      { width: 70, height: 25 },
    )

    await testSetup.renderOnce()
    expect(testSetup.captureCharFrame()).toMatchInlineSnapshot(`
      "                                                                      
       rchitecture                                                          
                                                                            
       ───────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────  
        Client    │────▶│   Router    │────▶│  Handler    │────▶│  Databas  
       ───────────┘     └─────────────┘     └─────────────┘     └─────────  
                                                                            
                                                                            
       rc/config.ts +1-0                                                    
                                                                            
        + export const x = 1                                                
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
                                                                            
        (1 section)  t theme         run with --web to share & collaborate  
                                                                            
      "
    `)
  })

  it("should render diagram code blocks with colored segments", async () => {
    // Diagrams with lang="diagram" should have structural chars colored differently
    const diagramHunk = createHunk(1, "src/config.ts", 0, 1, 1, [
      "+export const x = 1",
    ])

    const diagramReviewData: ReviewYaml = {
      hunks: [{
        hunkIds: [1],
        markdownDescription: `## Architecture Diagram

\`\`\`diagram
┌───────┐     ┌───────┐
│ Input │────▶│Output │
└───────┘     └───────┘
\`\`\`

The diagram above shows the flow.`,
      }],
    }

    testSetup = await testRender(
      <ReviewAppView
        hunks={[diagramHunk]}
        reviewData={diagramReviewData}
        isGenerating={false}
        themeName="github"
        width={60}
      />,
      { width: 60, height: 20 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    // The diagram should render with the structural characters
    // (box drawing and arrows) and text labels (Input, Output)
    expect(frame).toContain("Input")
    expect(frame).toContain("Output")
    expect(frame).toContain("Architecture Diagram")
  })

  // ============================================================================
  // LONG LINE WRAPPING TESTS
  // ============================================================================
  //
  // THE ISSUE:
  // When diff lines are long enough to wrap in split view, and the left/right
  // sides wrap to different numbers of visual lines, the alignment breaks.
  //
  // Example of broken alignment (single render):
  //   1 - const response...   1 + const response...
  //       example.com/users');    API_BASE_URL...
  //   2   return response...      Authorization...    <-- line 2 on wrong row!
  //                           2   return response...
  //
  // Example of correct alignment (after second render):
  //   1 - const response...   1 + const response...
  //       example.com/users');    API_BASE_URL...
  //                               Authorization...    <-- padding line added
  //   2   return response...  2   return response...  <-- line 2 aligned
  //
  // ROOT CAUSE (opentui timing bug):
  // 1. Diff.ts constructor calls buildView() at line 139-141 BEFORE layout
  // 2. At this point, this.width === 0, so canDoWrapAlignment check fails
  // 3. buildSplitView() skips alignment padding (line 651: this.width > 0)
  // 4. After layout, onResize() triggers requestRebuild() via microtask
  // 5. Second render has correct width, alignment works
  //
  // WORKAROUND: Call renderOnce() twice in tests
  // FIX: opentui should defer buildView() until after first layout
  // ============================================================================

  it("should render long diff lines that wrap correctly", async () => {
    const longLineHunk = createHunk(1, "src/config.ts", 0, 10, 10, [
      " export const VERY_LONG_CONFIG_SETTING_NAME_THAT_SPANS_MULTIPLE_COLUMNS = {",
      "-  apiEndpoint: 'https://api.example.com/v1/extremely/long/path/to/some/resource/that/needs/many/columns/to/display',",
      "+  apiEndpoint: process.env.API_URL || 'https://api.example.com/v1/extremely/long/path/to/some/resource/that/needs/many/columns/to/display/and/even/more/text/here',",
      "-  timeout: 5000,",
      "+  timeout: parseInt(process.env.TIMEOUT || '10000'),",
      "+  retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),",
      " }",
    ])

    const longLineReviewData: ReviewYaml = {
      hunks: [{
        hunkIds: [1],
        markdownDescription: `## Configuration Changes

Long configuration lines that should wrap properly.`,
      }],
    }

    testSetup = await testRender(
      <ReviewAppView
        hunks={[longLineHunk]}
        reviewData={longLineReviewData}
        isGenerating={false}
        themeName="github"
        width={100}
      />,
      {
        width: 100,
        height: 30,
      },
    )

    await testSetup.renderOnce()
    // Second render required for alignment - opentui Diff uses microtask-based rebuild after layout
    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                    
                 Configuration Changes                                                                    
                                                                                                          
                 Long configuration lines that should wrap properly.                                      
                                                                                                          
                                                                                                          
        src/config.ts +3-2                                                                                
                                                                                                          
        10   export const                                10   export const                                
             VERY_LONG_CONFIG_SETTING_NAME_THAT_SPANS_MU      VERY_LONG_CONFIG_SETTING_NAME_THAT_SPANS_MU 
             LTIPLE_COLUMNS = {                               LTIPLE_COLUMNS = {                          
        11 -   apiEndpoint: 'https://api.example.com/v1/ 11 +   apiEndpoint: process.env.API_URL ||       
             extremely/long/path/to/some/resource/that/       'https://api.example.com/v1/extremely/long/ 
             needs/many/columns/to/display',                  path/to/some/resource/that/needs/many/      
                                                              columns/to/display/and/even/more/text/      
                                                              here',                                      
        12 -   timeout: 5000,                            12 +   timeout: parseInt(process.env.TIMEOUT ||  
                                                              '10000'),                                   
                                                         13 +   retryAttempts: parseInt(process.env.      
                                                              RETRY_ATTEMPTS || '3'),                     
        13   }                                           14   }                                           
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
        (1 section)  t theme                                       run with --web to share & collaborate  
                                                                                                          
      "
    `)
  })

  it("should align wrapped lines correctly in narrow split view", async () => {
    // See "LONG LINE WRAPPING TESTS" comment block above for issue details.
    // This test uses narrower width (at split threshold=100) to force more wrapping.
    const longLineHunk = createHunk(1, "src/api.ts", 0, 1, 1, [
      "-const response = await fetch('https://api.example.com/users');",
      "+const response = await fetch(process.env.API_BASE_URL + '/users', { headers: { Authorization: 'Bearer ' + token } });",
      " return response.json();",
    ])

    const reviewData: ReviewYaml = {
      hunks: [{
        hunkIds: [1],
        markdownDescription: `## API Endpoint Update

Added environment-based URL and auth header.`,
      }],
    }

    testSetup = await testRender(
      <ReviewAppView
        hunks={[longLineHunk]}
        reviewData={reviewData}
        isGenerating={false}
        themeName="github"
        width={100}
      />,
      {
        width: 100,
        height: 20,
      },
    )

    await testSetup.renderOnce()
    // Second render to allow for any microtask-based rebuilds (alignment happens asynchronously)
    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                                    
                 API Endpoint Update                                                                      
                                                                                                          
                 Added environment-based URL and auth header.                                             
                                                                                                          
                                                                                                          
        src/api.ts +1-1                                                                                   
                                                                                                          
        1 - const response = await fetch('https://api.   1 + const response = await fetch(process.env.    
            example.com/users');                             API_BASE_URL + '/users', { headers: {        
                                                             Authorization: 'Bearer ' + token } });       
        2   return response.json();                      2   return response.json();                      
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
        (1 section)  t theme                                       run with --web to share & collaborate  
                                                                                                          
      "
    `)
  })

  it("should show generating indicator below last hunk when isGenerating is true", async () => {
    // When generating, a centered spinner+text indicator should appear below the content
    testSetup = await testRender(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={{
          hunks: [{
            hunkIds: [3],
            markdownDescription: `## Import changes

Added logger import.`,
          }],
        }}
        isGenerating={true}
        themeName="github"
        width={80}
      />,
      {
        width: 80,
        height: 25,
      },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toMatchInlineSnapshot(`
      "                                                                                
         Import changes                                                               
                                                                                      
         Added logger import.                                                         
                                                                                      
                                                                                      
       rc/index.ts +1-0                                                               
                                                                                      
          import { main } from './utils'                                              
        + import { logger } from './logger'                                           
                                                                                      
                                                                                      
                                                                                      
                                                                                      
                                      ⠋ generating                                    
                                                                                      
                                                                                      
                                                                                      
                                                                                      
                                                                                      
                                                                                      
                                                                                      
                                                                                      
        (1 section)  t theme                   run with --web to share & collaborate  
                                                                                      
      "
    `)
  })
})
