#!/usr/bin/env bun
// Preview script for ReviewApp component
// Run with: bun run scripts/preview-review.tsx
// Web mode: bun run scripts/preview-review.tsx --web

import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import * as React from "react"
import { ReviewApp, ReviewAppView } from "../src/review/review-app.tsx"
import { createHunk } from "../src/review/hunk-parser.ts"
import type { ReviewYaml } from "../src/review/types.ts"
import { captureResponsiveHtml, uploadHtml } from "../src/web-utils.ts"
import fs from "fs"
import { tmpdir } from "os"
import { join } from "path"

// Parse command line arguments
const args = process.argv.slice(2)
const webMode = args.includes("--web")
const captureMode = args.includes("--capture") // Internal flag for PTY capture

// Parse --cols and --rows passed by captureResponsiveHtml
function getArg(name: string): number | undefined {
  const idx = args.indexOf(name)
  const value = idx >= 0 ? args[idx + 1] : undefined
  return value ? parseInt(value) : undefined
}
const argCols = getArg("--cols")
const argRows = getArg("--rows")

// Example hunks with realistic diff content
const exampleHunks = [
  // Error handling
  createHunk(1, "src/errors/index.ts", 0, 1, 1, [
    "+export class NotFoundError extends Error {",
    "+  constructor(message: string) {",
    "+    super(message)",
    "+    this.name = 'NotFoundError'",
    "+  }",
    "+}",
    "+",
    "+export class ValidationError extends Error {",
    "+  constructor(message: string) {",
    "+    super(message)",
    "+    this.name = 'ValidationError'",
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
    " ",
    " export async function updateUser(id: string, data: UserUpdate) {",
    "-  return db.users.update(id, data)",
    "+  const user = await getUser(id)",
    "+  validateUserUpdate(data)",
    "+  return db.users.update(id, { ...user, ...data })",
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
  // Test file
  createHunk(4, "src/api/users.test.ts", 0, 50, 50, [
    " describe('getUser', () => {",
    "+  it('should throw NotFoundError for missing user', async () => {",
    "+    await expect(getUser('nonexistent')).rejects.toThrow(NotFoundError)",
    "+  })",
    "+",
    "   it('should return user when found', async () => {",
    "     const user = await getUser('123')",
    "     expect(user).toBeDefined()",
    "   })",
    " })",
  ]),
]

// Rich review data with multiple sections
const exampleReviewData: ReviewYaml = {
  hunks: [
    {
      hunkIds: [1],
      markdownDescription: `## Custom Error Classes

Introduces new error classes for better error handling throughout the application:

- **NotFoundError**: Thrown when a requested resource doesn't exist
- **ValidationError**: Thrown when input validation fails

These custom errors enable more specific catch blocks and provide clearer error messages to API consumers.`,
    },
    {
      hunkIds: [2],
      markdownDescription: `## API Endpoint Improvements

The user API endpoints have been enhanced with:

1. **Better error handling** - Now throws \`NotFoundError\` instead of returning null
2. **Input validation** - Validates update data before persisting
3. **Data sanitization** - User data is sanitized before returning

This improves both security and developer experience when working with the API.

### Architecture Diagram

The new request flow with error handling:

\`\`\`diagram
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Router    │────▶│  Handler    │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │                   │
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │  Validate   │     │   Check     │     │   Query     │
                    │   Route     │     │   Auth      │     │   Execute   │
                    └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │                   │
                           │         ┌─────────┴─────────┐         │
                           │         ▼                   ▼         │
                           │   ┌───────────┐     ┌───────────┐     │
                           │   │ NotFound  │     │ Validation│     │
                           │   │  Error    │     │   Error   │     │
                           │   └───────────┘     └───────────┘     │
                           │                                       │
                           └───────────────────────────────────────┘
\`\`\`

This ensures all errors are caught and handled appropriately.`,
    },
    {
      hunkIds: [3],
      markdownDescription: `## Environment-based Configuration

Database configuration now reads from environment variables with sensible defaults:

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| Host | \`DB_HOST\` | localhost | Database server hostname |
| Port | \`DB_PORT\` | 5432 | Database server port |
| SSL | auto | production only | Enable SSL/TLS encryption |
| Pool Size | \`DB_POOL_SIZE\` | 10 | Maximum connections in pool |
| Timeout | \`DB_TIMEOUT\` | 30000 | Connection timeout in ms |
| Retry | \`DB_RETRY_COUNT\` | 3 | Number of connection retries |

### Complete Configuration Matrix

| Environment | DB_HOST | DB_PORT | SSL | Pool | Timeout | Retry |
|-------------|---------|---------|-----|------|---------|-------|
| Development | localhost | 5432 | off | 5 | 5000 | 1 |
| Staging | staging-db.internal | 5432 | on | 10 | 15000 | 2 |
| Production | prod-db.cluster | 5432 | on | 50 | 30000 | 3 |
| CI/CD | localhost | 5433 | off | 2 | 3000 | 0 |

This enables proper configuration for different deployment environments.`,
    },
    {
      hunkIds: [4],
      markdownDescription: `## Test Coverage

Added test case for the new error handling behavior, ensuring that:

- Missing users throw \`NotFoundError\`
- The error message is descriptive

### Test Flow Diagram

\`\`\`diagram
                                    ┌──────────────────────────────────────────────────────────────────┐
                                    │                         Test Suite                               │
                                    └──────────────────────────────────────────────────────────────────┘
                                                              │
                         ┌────────────────────────────────────┼────────────────────────────────────┐
                         │                                    │                                    │
                         ▼                                    ▼                                    ▼
              ┌─────────────────────┐           ┌─────────────────────┐           ┌─────────────────────┐
              │   Unit Tests        │           │  Integration Tests  │           │    E2E Tests        │
              │   (getUser)         │           │   (API endpoints)   │           │   (Full flow)       │
              └─────────────────────┘           └─────────────────────┘           └─────────────────────┘
                         │                                    │                                    │
            ┌────────────┼────────────┐          ┌───────────┼───────────┐           ┌────────────┼────────────┐
            │            │            │          │           │           │           │            │            │
            ▼            ▼            ▼          ▼           ▼           ▼           ▼            ▼            ▼
       ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
       │ Found   │ │NotFound │ │ Validate│ │  GET    │ │  POST   │ │  PUT    │ │ Login   │ │ Create  │ │ Delete  │
       │ User    │ │ Error   │ │ Input   │ │ /users  │ │ /users  │ │ /users  │ │ Flow    │ │ Flow    │ │ Flow    │
       └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
\`\`\`

All tests pass and coverage is at 95%.`,
    },
  ],
}

async function main() {
  // Web mode: capture and upload HTML, then open in browser
  if (webMode) {
    console.log("Capturing preview...")
    
    const scriptPath = import.meta.path
    const { htmlDesktop, htmlMobile } = await captureResponsiveHtml(
      ["run", scriptPath, "--capture"],
      {
        desktopCols: 200,
        mobileCols: 80,
        baseRows: 200,
        themeName: "github",
        title: "Review Preview",
      }
    )

    console.log("Uploading...")
    const result = await uploadHtml(htmlDesktop, htmlMobile)
    console.log(`\nPreview URL: ${result.url}`)
    console.log("(expires in 7 days)")
    return
  }

  // Create a temp YAML file with the example data
  const yamlPath = join(tmpdir(), `critique-preview-${Date.now()}.yaml`)
  
  // Write YAML content (simple format that yaml-watcher can parse)
  const yamlContent = `hunks:
${exampleReviewData.hunks.map(group => `  - ${group.hunkIds ? `hunkIds: [${group.hunkIds.join(', ')}]` : `hunkId: ${group.hunkId}`}
    markdownDescription: |
${group.markdownDescription.split('\n').map(line => `      ${line}`).join('\n')}`).join('\n')}`

  fs.writeFileSync(yamlPath, yamlContent)

  // Capture mode: render once and exit (used internally by --web)
  if (captureMode) {
    // Use args from captureResponsiveHtml, or PTY dimensions, or fallback
    const termCols = argCols || process.stdout.columns || 140
    const termRows = argRows || process.stdout.rows || 80
    
    // Override terminal dimensions
    process.stdout.columns = termCols
    process.stdout.rows = termRows

    const renderer = await createCliRenderer({
      useAlternateScreen: false,
      exitOnCtrlC: false,
    })

    // Wait for render to settle before exiting (debounced)
    let exitTimeout: ReturnType<typeof setTimeout> | undefined
    const originalRequestRender = renderer.root.requestRender.bind(renderer.root)
    renderer.root.requestRender = function () {
      originalRequestRender()
      if (exitTimeout) clearTimeout(exitTimeout)
      exitTimeout = setTimeout(() => {
        try { fs.unlinkSync(yamlPath) } catch {}
        renderer.destroy()
      }, 1000)
    }

    createRoot(renderer).render(
      <ReviewAppView
        hunks={exampleHunks}
        reviewData={exampleReviewData}
        isGenerating={false}
        themeName="github"
        width={termCols}
        showFooter={false}
        renderer={renderer}
      />
    )
    return
  }

  // Interactive TUI mode
  const renderer = await createCliRenderer({
    onDestroy() {
      try { fs.unlinkSync(yamlPath) } catch {}
      process.exit(0)
    },
    exitOnCtrlC: true,
  })

  const root = createRoot(renderer)
  root.render(
    <ReviewApp
      hunks={exampleHunks}
      yamlPath={yamlPath}
      isGenerating={false}
    />
  )
}

main().catch(console.error)
