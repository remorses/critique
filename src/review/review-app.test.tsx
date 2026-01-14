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
               ## Import changes                                                                          
                                                                                                          
               Added logger import to support new logging functionality.                                  
                                                                                                          
        #3 src/index.ts +1-0                                                                              
        1   import { main } from './utils'                                                                
        2 + import { logger } from './logger'                                                             
                                                                                                          
                                                                                                          
               ## Input validation and logging                                                            
                                                                                                          
               These changes add input validation to the helper function and integrate logging            
               in the main function.                                                                      
                                                                                                          
        #1 src/utils.ts +3-1                                                                              
        10   function helper() {                         10   function helper() {                         
        11 -   return null                               11 +   // Add validation                         
                                                         12 +   if (!input) return null                   
                                                         13 +   return process(input)                     
        12   }                                           14   }                                           
                                                                                                          
        #2 src/utils.ts +2-0                                                                              
        27   export function main() {                                                                     
        28 +   const result = helper()                                                                    
        29 +   console.log(result)                                                                        
        30     return result                                                                              
        31   }                                                                                            
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                   q quit  j/k scroll  (2 sections)  t theme                              
                                                                                                          
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
                                   ## Import changes                                                                                              
                                                                                                                                                  
                                   Added logger import to support new logging functionality.                                                      
                                                                                                                                                  
        #3 src/index.ts +1-0                                                                                                                      
        1   import { main } from './utils'                                                                                                        
        2 + import { logger } from './logger'                                                                                                     
                                                                                                                                                  
                                                                                                                                                  
                                   ## Input validation and logging                                                                                
                                                                                                                                                  
                                   These changes add input validation to the helper function and integrate logging                                
                                   in the main function.                                                                                          
                                                                                                                                                  
        #1 src/utils.ts +3-1                                                                                                                      
        10   function helper() {                                             10   function helper() {                                             
        11 -   return null                                                   11 +   // Add validation                                             
                                                                             12 +   if (!input) return null                                       
                                                                             13 +   return process(input)                                         
        12   }                                                               14   }                                                               
                                                                                                                                                  
        #2 src/utils.ts +2-0                                                                                                                      
        27   export function main() {                                                                                                             
        28 +   const result = helper()                                                                                                            
        29 +   console.log(result)                                                                                                                
        30     return result                                                                                                                      
        31   }                                                                                                                                    
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                       q quit  j/k scroll  (2 sections)  t theme                                                  
                                                                                                                                                  
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
                                   ## Custom Error Classes                                                                                        
                                                                                                                                                  
                                   Introduces a new error class for better error handling:                                                        
                                                                                                                                                  
                                   - **NotFoundError**: Used when a requested resource doesn't exist                                              
                                                                                                                                                  
                                   This enables more specific catch blocks and better error messages.                                             
                                                                                                                                                  
        #1 src/errors/index.ts +6-0                                                                                                               
        1 + export class NotFoundError extends Error {                                                                                            
        2 +   constructor(message: string) {                                                                                                      
        3 +     super(message)                                                                                                                    
        4 +     this.name = 'NotFoundError'                                                                                                       
        5 +   }                                                                                                                                   
        6 + }                                                                                                                                     
                                                                                                                                                  
                                                                                                                                                  
                                   ## User API Improvements                                                                                       
                                                                                                                                                  
                                   ### Error Handling                                                                                             
                                   The getUser function now properly handles missing users by throwing a                                          
                                   NotFoundError.                                                                                                 
                                                                                                                                                  
                                   ### Security                                                                                                   
                                   User data is now sanitized before being returned to prevent leaking sensitive                                  
                                   fields.                                                                                                        
                                                                                                                                                  
        #2 src/api/users.ts +5-2                                                                                                                  
        15   export async function getUser(id: string) {                     15   export async function getUser(id: string) {                     
        16 -   const user = await db.users.find(id)                          16 +   const user = await db.users.find(id)                          
        17 -   return user                                                   17 +   if (!user) {                                                  
                                                                             18 +     throw new NotFoundError(\`User \${id} not found\`)             
                                                                             19 +   }                                                             
                                                                             20 +   return sanitizeUser(user)                                     
        18   }                                                               21   }                                                               
                                                                                                                                                  
                                                                                                                                                  
                                   ## Environment-based Configuration                                                                             
                                                                                                                                                  
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
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                                                                                                                  
                                                       q quit  j/k scroll  (3 sections)  t theme                                                  
                                                                                                                                                  
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
               ## Input Validation                                                                        
                                                                                                          
               Added validation at handler start.                                                         
                                                                                                          
        #1 src/api/handlers.ts +5-1                                                                       
        10   export async function handleRequest(req:    10   export async function handleRequest(req:    
             Request) {                                       Request) {                                  
        11 -   const data = req.body                     11 +   // Input validation                       
                                                         12 +   if (!req.body) {                          
                                                         13 +     throw new ValidationError('Request      
                                                              body is required')                          
                                                         14 +   }                                         
                                                         15 +   const data = validateInput(req.body)      
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                    q quit  j/k scroll  (1 section)  t theme                              
                                                                                                          
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
                         ## Input Validation                                                                                  
                                                                                                                              
                         Added proper input validation at the start of the handler:                                           
                         - Check for missing request body                                                                     
                         - Validate input before processing                                                                   
                                                                                                                              
        #1 src/api/handlers.ts +5-1                                                                                           
        10   export async function handleRequest(req: Request) {   10   export async function handleRequest(req: Request) {   
        11 -   const data = req.body                               11 +   // Input validation                                 
                                                                   12 +   if (!req.body) {                                    
                                                                   13 +     throw new ValidationError('Request body is        
                                                                        required')                                            
                                                                   14 +   }                                                   
                                                                   15 +   const data = validateInput(req.body)                
                                                                                                                              
                                                                                                                              
                         ## Async Processing and Logging                                                                      
                                                                                                                              
                         Improved the processing logic:                                                                       
                         - Made process call async for better performance                                                     
                         - Added request logging for debugging                                                                
                                                                                                                              
        #1 src/api/handlers.ts +4-1                                                                                           
        12                                                         16                                                         
        13     // Process the request                              17     // Process the request                              
        14 -   const result = process(data)                        18 +   const result = await processAsync(data)             
                                                                   19 +                                                       
                                                                   20 +   // Logging                                          
                                                                   21 +   logger.info('Request processed', { requestId: req.  
        15                                                              id })                                                 
        16     return result                                       22                                                         
                                                                   23     return result                                       
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                                                                                                              
                                             q quit  j/k scroll  (2 sections)  t theme                                        
                                                                                                                              
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
               ## Import changes                                                                          
                                                                                                          
               Added logger import.                                                                       
                                                                                                          
        #3 src/index.ts +1-0                                                                              
        1   import { main } from './utils'                                                                
        2 + import { logger } from './logger'                                                             
                                                                                                          
                                                                                                          
               ## Validation                                                                              
                                                                                                          
               Input validation logic.                                                                    
                                                                                                          
        #1 src/api/handlers.ts +5-1                                                                       
        10   export async function handleRequest(req:    10   export async function handleRequest(req:    
             Request) {                                       Request) {                                  
        11 -   const data = req.body                     11 +   // Input validation                       
                                                         12 +   if (!req.body) {                          
                                                         13 +     throw new ValidationError('Request      
                                                              body is required')                          
                                                         14 +   }                                         
                                                         15 +   const data = validateInput(req.body)      
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                   q quit  j/k scroll  (2 sections)  t theme                              
                                                                                                          
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
               ## Full hunk via hunkId                                                                    
                                                                                                          
               This uses hunkId instead of hunkIds but shows full hunk.                                   
                                                                                                          
        #1 src/utils.ts +3-1                                                                              
        10   function helper() {                         10   function helper() {                         
        11 -   return null                               11 +   // Add validation                         
                                                         12 +   if (!input) return null                   
                                                         13 +   return process(input)                     
        12   }                                           14   }                                           
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                                                                                          
                                    q quit  j/k scroll  (1 section)  t theme                              
                                                                                                          
      "
    `)
  })
})
