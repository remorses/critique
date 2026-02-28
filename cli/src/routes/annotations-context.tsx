// Route: GET /v/:id/annotations
// Returns all annotations as markdown, matching agentation's generateOutput format.
// This is the format agents and LLMs consume best.

import { Hono } from "hono"
import type { KVNamespace } from "@cloudflare/workers-types"

type Bindings = {
  CRITIQUE_KV: KVNamespace
  CommentRoom: {
    idFromName(name: string): { toString(): string }
    get(id: { toString(): string }): {
      fetch(request: Request): Promise<Response>
    }
  }
}

type AnnotationData = {
  id: string
  comment: string
  element: string
  elementPath: string
  nearbyText?: string
  selectedText?: string
  anchor?: string
  intent?: string
  severity?: string
  status?: string
  authorId?: string
  userName?: string
  createdAt?: string
  thread?: Array<{ role: string; content: string; timestamp: number }>
}

function generateMarkdown(
  annotations: AnnotationData[],
  diffUrl: string,
): string {
  if (annotations.length === 0) return "No annotations yet.\n"

  let output = `## Page Feedback: ${diffUrl}\n\n`

  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i]
    output += `### ${i + 1}. ${a.element || a.elementPath}\n`
    if (a.elementPath) {
      output += `**Location:** ${a.elementPath}\n`
    }
    if (a.anchor) {
      output += `**Anchor:** ${a.anchor}\n`
    }
    if (a.selectedText) {
      output += `**Selected text:** "${a.selectedText}"\n`
    }
    if (a.nearbyText && !a.selectedText) {
      output += `**Context:** ${a.nearbyText.slice(0, 100)}\n`
    }
    if (a.status && a.status !== "pending") {
      output += `**Status:** ${a.status}\n`
    }
    if (a.severity) {
      output += `**Severity:** ${a.severity}\n`
    }
    if (a.intent) {
      output += `**Intent:** ${a.intent}\n`
    }
    output += `**Feedback:** ${a.comment}\n`
    if (a.thread && a.thread.length > 0) {
      output += "\n"
      for (const msg of a.thread) {
        output += `> **${msg.role}:** ${msg.content}\n`
      }
    }
    output += "\n"
  }

  return output.trim() + "\n"
}

const route = new Hono<{ Bindings: Bindings }>()

route.get("/v/:id/annotations", async (c) => {
  const id = c.req.param("id")

  if (!id || !/^[a-f0-9]{16,32}$/.test(id)) {
    return c.text("Invalid ID", 400)
  }

  // Fetch annotations from CommentRoom DO
  // x-partykit-room header required by agents SDK (partyserver) to initialize DO name
  const doId = c.env.CommentRoom.idFromName(id)
  const stub = c.env.CommentRoom.get(doId)
  const req = new Request("https://internal/api/annotations")
  req.headers.set("x-partykit-room", id)
  const resp = await stub.fetch(req)
  const annotations = (await resp.json()) as AnnotationData[]

  const origin = new URL(c.req.url).origin
  const diffUrl = `${origin}/v/${id}`
  const markdown = generateMarkdown(annotations, diffUrl)

  return c.text(markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  })
})

export { route as annotationsContextRoute }
