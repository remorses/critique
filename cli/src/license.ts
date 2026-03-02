// License key storage in ~/.critique/license.json.
// Also stores owner secret for authenticating diff deletion.

import fs from "fs"
import { join } from "path"
import { homedir } from "os"
import { randomUUID } from "crypto"

const LICENSE_DIR = join(homedir(), ".critique")
const LICENSE_FILE = join(LICENSE_DIR, "license.json")

export interface StoredLicense {
  key?: string
  ownerSecret?: string
}

export function loadStoredLicense(): StoredLicense | null {
  try {
    const data = fs.readFileSync(LICENSE_FILE, "utf-8")
    return JSON.parse(data) as StoredLicense
  } catch {
    return null
  }
}

export function saveStoredLicense(license: StoredLicense): void {
  try {
    if (!fs.existsSync(LICENSE_DIR)) {
      fs.mkdirSync(LICENSE_DIR, { recursive: true })
    }
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(license, null, 2))
  } catch {
    // Ignore write errors
  }
}

export function loadStoredLicenseKey(): string | null {
  const license = loadStoredLicense()
  if (!license?.key) return null
  return license.key.trim() || null
}

export function saveStoredLicenseKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) return

  // Preserve existing owner secret when saving license key
  const existing = loadStoredLicense()
  saveStoredLicense({
    ...existing,
    key: trimmed,
  })
}

/**
 * Load existing owner secret or create one if it doesn't exist.
 * The owner secret is used to authenticate diff deletion requests.
 */
export function loadOrCreateOwnerSecret(): string {
  const existing = loadStoredLicense()
  
  if (existing?.ownerSecret) {
    return existing.ownerSecret
  }

  // Generate new owner secret
  const ownerSecret = randomUUID()
  
  // Save while preserving existing license key
  saveStoredLicense({
    ...existing,
    ownerSecret,
  })

  return ownerSecret
}
