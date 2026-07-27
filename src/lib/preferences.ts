import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { UserPreferences } from '@/types/preferences'

// Per-user storage: one file per user, named by a hash of the email so no raw
// PII (email) ever lands on disk and users are fully isolated from each other.
const PREFERENCES_DIR = path.join(process.cwd(), 'data', 'preferences')

// Derive a safe, non-reversible, filename-safe key from the user's email.
export const getUserKey = (email: string): string => {
  return crypto
    .createHash('sha256')
    .update((email || '').trim().toLowerCase())
    .digest('hex')
}

const filePathForUser = (userKey: string): string => {
  // userKey is a 64-char hex string, so it's inherently path-traversal safe.
  return path.join(PREFERENCES_DIR, `${userKey}.json`)
}

export const sanitizeInput = (text: string): string => {
  if (typeof text !== 'string') return ''

  // Remove HTML tags and dangerous content
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim()
}

const DEFAULT_PREFERENCES: UserPreferences = {
  playlists: {},
  lockedPlaylists: {},
  categories: [],
  lastSync: null,
}

export const readPreferences = async (userKey: string): Promise<UserPreferences> => {
  if (!userKey) return { ...DEFAULT_PREFERENCES }
  try {
    const data = await fs.readFile(filePathForUser(userKey), 'utf8')
    const preferences = JSON.parse(data)

    if (!preferences || typeof preferences !== 'object') {
      throw new Error('Invalid preferences structure')
    }

    return {
      playlists: preferences.playlists || {},
      lockedPlaylists: preferences.lockedPlaylists || {},
      categories: preferences.categories || [],
      lastSync: preferences.lastSync || null,
      rateLimits: preferences.rateLimits || {},
      categoryEmojis: preferences.categoryEmojis || {},
    }
  } catch {
    // Missing file / parse error → defaults (do not log user data)
    return { ...DEFAULT_PREFERENCES }
  }
}

export const writePreferences = async (
  userKey: string,
  data: UserPreferences
): Promise<boolean> => {
  if (!userKey) return false
  try {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data structure')
    }

    const validatedData: UserPreferences = {
      playlists: data.playlists || {},
      lockedPlaylists: data.lockedPlaylists || {},
      categories: data.categories || [],
      lastSync: data.lastSync || null,
      rateLimits: data.rateLimits || {},
      categoryEmojis: data.categoryEmojis || {},
    }

    await fs.mkdir(PREFERENCES_DIR, { recursive: true })
    await fs.writeFile(
      filePathForUser(userKey),
      JSON.stringify(validatedData, null, 2),
      'utf8'
    )
    return true
  } catch {
    return false
  }
}
