// Debug logger that writes to console and app.log when DEBUG=true.
// Provides log levels (log, info, warn, error, debug) with timestamps.
// Disabled in production; enable with DEBUG=true or DEBUG=1 environment variable.

import fs from "fs"
import { join } from "path"

const LOG_FILE = join(process.cwd(), "app.log")
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1"

// Clear log file on startup if DEBUG is enabled
if (DEBUG) {
  try {
    fs.writeFileSync(LOG_FILE, `--- Log started at ${new Date().toISOString()} ---\n`)
  } catch {
    // Ignore errors
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg
      if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack}`
      try {
        return JSON.stringify(arg, null, 2)
      } catch {
        return String(arg)
      }
    })
    .join(" ")
}

function writeToFile(level: string, args: unknown[]) {
  if (!DEBUG) return
  
  const timestamp = new Date().toISOString()
  const message = `[${timestamp}] [${level}] ${formatArgs(args)}\n`
  
  try {
    fs.appendFileSync(LOG_FILE, message)
  } catch {
    // Ignore file write errors
  }
}

export const logger = {
  log(...args: unknown[]) {
    if (DEBUG) {
      console.error(...args)
      writeToFile("LOG", args)
    }
  },

  info(...args: unknown[]) {
    if (DEBUG) {
      console.error(...args)
      writeToFile("INFO", args)
    }
  },

  warn(...args: unknown[]) {
    if (DEBUG) {
      console.error(...args)
      writeToFile("WARN", args)
    }
  },

  error(...args: unknown[]) {
    // Always log errors to file if DEBUG, but only console if DEBUG
    writeToFile("ERROR", args)
    if (DEBUG) {
      console.error(...args)
    }
  },

  debug(...args: unknown[]) {
    if (DEBUG) {
      console.error(...args)
      writeToFile("DEBUG", args)
    }
  },
}

export default logger
