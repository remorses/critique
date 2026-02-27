// End-to-end preview worker test for Agentation API compatibility.
// Uses real fetch requests against preview.critique.work and validates
// session lifecycle, annotation CRUD, multi-user cookies, and SSE events.

import { describe, expect, test } from "bun:test"
import crypto from "crypto"

const BASE_URL = process.env.AGENTATION_BASE_URL || "https://preview.critique.work/a"
const SSE_TIMEOUT_MS = 30_000

type JsonObject = Record<string, unknown>

interface SseEvent {
  event: string
  data: unknown
  id?: number
}

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex")
}

function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as JsonObject
}

function getString(record: JsonObject, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== "string") {
    throw new Error(`${label}.${key} must be a string`)
  }
  return value
}

function getNumber(record: JsonObject, key: string, label: string): number {
  const value = record[key]
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label}.${key} must be a number`)
  }
  return value
}

function getArray(record: JsonObject, key: string, label: string): unknown[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array`)
  }
  return value
}

function parseJson(text: string): unknown {
  if (text.length === 0) return null
  return JSON.parse(text)
}

async function requestJson(
  path: string,
  options?: {
    method?: string
    body?: unknown
    userId?: string
    headers?: HeadersInit
  },
): Promise<{ response: Response; json: unknown; text: string }> {
  const headers = new Headers(options?.headers)
  headers.set("Accept", "application/json")
  if (options?.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }
  if (options?.userId) {
    headers.set("Cookie", `cw_user_id=${options.userId}`)
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options?.method || "GET",
    headers,
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const text = await response.text()
  const json = parseJson(text)
  return { response, json, text }
}

function parseSseFrame(frame: string): SseEvent | null {
  const lines = frame.split("\n")
  let eventName = ""
  let id: number | undefined
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim()
      continue
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart())
      continue
    }
    if (line.startsWith("id:")) {
      const parsed = Number(line.slice("id:".length).trim())
      if (Number.isFinite(parsed)) {
        id = parsed
      }
    }
  }

  if (!eventName) return null
  const dataText = dataLines.join("\n")
  if (!dataText) {
    return { event: eventName, data: null, id }
  }

  try {
    return { event: eventName, data: JSON.parse(dataText), id }
  } catch {
    return { event: eventName, data: dataText, id }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

async function collectSseEvents(
  stream: ReadableStream<Uint8Array>,
  expectedEventNames: string[],
): Promise<SseEvent[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const expectedSet = new Set(expectedEventNames)
  const seen = new Map<string, SseEvent>()
  let buffer = ""
  const start = Date.now()

  try {
    while (seen.size < expectedSet.size) {
      const elapsed = Date.now() - start
      const remaining = SSE_TIMEOUT_MS - elapsed
      if (remaining <= 0) {
        throw new Error(
          `Timed out waiting for SSE events. Seen: ${Array.from(seen.keys()).join(", ") || "none"}`,
        )
      }

      const readResult = await withTimeout(
        reader.read(),
        remaining,
        `Timed out waiting for SSE chunk after ${SSE_TIMEOUT_MS}ms`,
      )

      if (readResult.done) {
        break
      }

      buffer += decoder.decode(readResult.value, { stream: true })
      buffer = buffer.replaceAll("\r\n", "\n")

      while (true) {
        const delimiterIndex = buffer.indexOf("\n\n")
        if (delimiterIndex === -1) break

        const rawFrame = buffer.slice(0, delimiterIndex)
        buffer = buffer.slice(delimiterIndex + 2)

        const parsed = parseSseFrame(rawFrame)
        if (!parsed) continue
        if (!expectedSet.has(parsed.event)) continue
        if (!seen.has(parsed.event)) {
          seen.set(parsed.event, parsed)
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  if (seen.size < expectedSet.size) {
    const missing = expectedEventNames.filter((name) => !seen.has(name))
    throw new Error(`Missing SSE events: ${missing.join(", ")}`)
  }

  return expectedEventNames.map((name) => seen.get(name) as SseEvent)
}

describe("preview worker Agentation API", () => {
  test("supports session lifecycle, multi-user annotation CRUD, and SSE", async () => {
    const userA = `preview-user-a-${randomHex(4)}`
    const userB = `preview-user-b-${randomHex(4)}`
    const sessionId = randomHex(16)

    const health = await requestJson("/health")
    expect(health.response.status).toBe(200)
    const healthBody = asObject(health.json, "health")
    expect(getString(healthBody, "status", "health")).toBe("ok")

    const createdSession = await requestJson("/sessions", {
      method: "POST",
      body: { url: `https://preview.critique.work/v/${sessionId}` },
    })
    expect(createdSession.response.status).toBe(200)
    const sessionBody = asObject(createdSession.json, "createdSession")
    expect(getString(sessionBody, "id", "createdSession")).toBe(sessionId)

    const fetchedSession = await requestJson(`/sessions/${sessionId}`)
    expect(fetchedSession.response.status).toBe(200)
    const fetchedSessionBody = asObject(fetchedSession.json, "fetchedSession")
    const initialAnnotations = getArray(fetchedSessionBody, "annotations", "fetchedSession")
    expect(initialAnnotations.length).toBe(0)

    const sseResponse = await fetch(`${BASE_URL}/sessions/${sessionId}/events`, {
      headers: { Accept: "text/event-stream" },
    })
    expect(sseResponse.ok).toBe(true)
    const sseContentType = sseResponse.headers.get("Content-Type") || ""
    expect(sseContentType.includes("text/event-stream")).toBe(true)
    expect(sseResponse.body).toBeTruthy()

    const sseEventsPromise = collectSseEvents(sseResponse.body as ReadableStream<Uint8Array>, [
      "annotation.created",
      "annotation.updated",
      "action.requested",
      "annotation.deleted",
    ])

    const createdAnnotationResponse = await requestJson(`/sessions/${sessionId}/annotations`, {
      method: "POST",
      userId: userA,
      body: {
        comment: "preview smoke create",
        elementPath: "#content > .line:nth-child(1)",
        element: "div",
        timestamp: Date.now(),
        x: 12,
        y: 32,
        status: "pending",
      },
    })
    expect(createdAnnotationResponse.response.status).toBe(201)
    const createdAnnotation = asObject(createdAnnotationResponse.json, "createdAnnotation")
    const annotationId = getString(createdAnnotation, "id", "createdAnnotation")
    expect(annotationId.startsWith(`${sessionId}_`)).toBe(true)
    expect(getString(createdAnnotation, "authorId", "createdAnnotation")).toBe(userA)
    expect(getString(createdAnnotation, "sessionId", "createdAnnotation")).toBe(sessionId)

    const getCreated = await requestJson(`/annotations/${annotationId}`)
    expect(getCreated.response.status).toBe(200)
    const getCreatedBody = asObject(getCreated.json, "getCreated")
    expect(getString(getCreatedBody, "id", "getCreated")).toBe(annotationId)

    const pendingBeforeResolve = await requestJson(`/sessions/${sessionId}/pending`)
    expect(pendingBeforeResolve.response.status).toBe(200)
    const pendingBeforeResolveBody = asObject(pendingBeforeResolve.json, "pendingBeforeResolve")
    const pendingBeforeResolveList = getArray(
      pendingBeforeResolveBody,
      "annotations",
      "pendingBeforeResolve",
    ).map((item) => asObject(item, "pendingBeforeResolve.annotations"))
    expect(pendingBeforeResolveList.some((item) => getString(item, "id", "pending item") === annotationId)).toBe(
      true,
    )

    const updatedAnnotationResponse = await requestJson(`/annotations/${annotationId}`, {
      method: "PATCH",
      userId: userB,
      body: {
        status: "resolved",
        resolvedBy: "human",
        comment: "preview smoke resolved",
      },
    })
    expect(updatedAnnotationResponse.response.status).toBe(200)
    const updatedAnnotation = asObject(updatedAnnotationResponse.json, "updatedAnnotation")
    expect(getString(updatedAnnotation, "status", "updatedAnnotation")).toBe("resolved")
    expect(getString(updatedAnnotation, "comment", "updatedAnnotation")).toBe("preview smoke resolved")

    const threadResponse = await requestJson(`/annotations/${annotationId}/thread`, {
      method: "POST",
      userId: userB,
      body: {
        role: "human",
        content: "confirmed in preview test",
      },
    })
    expect(threadResponse.response.status).toBe(201)
    const threadBody = asObject(threadResponse.json, "thread")
    expect(getString(threadBody, "role", "thread")).toBe("human")

    const pendingAfterResolve = await requestJson(`/sessions/${sessionId}/pending`)
    expect(pendingAfterResolve.response.status).toBe(200)
    const pendingAfterResolveBody = asObject(pendingAfterResolve.json, "pendingAfterResolve")
    const pendingAfterResolveList = getArray(
      pendingAfterResolveBody,
      "annotations",
      "pendingAfterResolve",
    ).map((item) => asObject(item, "pendingAfterResolve.annotations"))
    expect(pendingAfterResolveList.some((item) => getString(item, "id", "pending item") === annotationId)).toBe(
      false,
    )

    const actionResponse = await requestJson(`/sessions/${sessionId}/action`, {
      method: "POST",
      userId: userB,
      body: {
        output: "please handle this annotation",
      },
    })
    expect(actionResponse.response.status).toBe(200)
    const actionBody = asObject(actionResponse.json, "action")
    expect(actionBody.success).toBe(true)
    expect(getNumber(actionBody, "annotationCount", "action")).toBeGreaterThanOrEqual(1)
    const delivered = asObject(actionBody.delivered, "action.delivered")
    expect(getNumber(delivered, "total", "action.delivered")).toBeGreaterThanOrEqual(0)

    const deleteResponse = await requestJson(`/annotations/${annotationId}`, {
      method: "DELETE",
      userId: userB,
    })
    expect(deleteResponse.response.status).toBe(200)
    const deleteBody = asObject(deleteResponse.json, "delete")
    expect(deleteBody.success).toBe(true)

    const getDeleted = await requestJson(`/annotations/${annotationId}`)
    expect(getDeleted.response.status).toBe(404)

    const sseEvents = await sseEventsPromise
    const createdEvent = asObject(sseEvents[0]!.data, "sse.created")
    const updatedEvent = asObject(sseEvents[1]!.data, "sse.updated")
    const actionEvent = asObject(sseEvents[2]!.data, "sse.action")
    const deletedEvent = asObject(sseEvents[3]!.data, "sse.deleted")

    expect(getString(createdEvent, "sessionId", "sse.created")).toBe(sessionId)
    expect(getString(updatedEvent, "sessionId", "sse.updated")).toBe(sessionId)
    expect(getString(actionEvent, "sessionId", "sse.action")).toBe(sessionId)
    expect(getString(deletedEvent, "sessionId", "sse.deleted")).toBe(sessionId)

    const createdSeq = getNumber(createdEvent, "sequence", "sse.created")
    const updatedSeq = getNumber(updatedEvent, "sequence", "sse.updated")
    const actionSeq = getNumber(actionEvent, "sequence", "sse.action")
    const deletedSeq = getNumber(deletedEvent, "sequence", "sse.deleted")
    expect(createdSeq < updatedSeq).toBe(true)
    expect(updatedSeq < actionSeq).toBe(true)
    expect(actionSeq < deletedSeq).toBe(true)

    const createdPayload = asObject(createdEvent.payload, "sse.created.payload")
    const updatedPayload = asObject(updatedEvent.payload, "sse.updated.payload")
    const actionPayload = asObject(actionEvent.payload, "sse.action.payload")
    const deletedPayload = asObject(deletedEvent.payload, "sse.deleted.payload")
    expect(getString(createdPayload, "id", "sse.created.payload")).toBe(annotationId)
    expect(getString(updatedPayload, "id", "sse.updated.payload")).toBe(annotationId)
    expect(getString(actionPayload, "output", "sse.action.payload")).toBe("please handle this annotation")
    expect(getString(deletedPayload, "id", "sse.deleted.payload")).toBe(annotationId)
  }, 120_000)
})
