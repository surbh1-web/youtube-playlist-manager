interface PlaylistRecord {
  id: string
  title: string
  category: string
  confidence?: string  // backend-only signal (High|Medium|Low); not shown to the user
  isLocked: boolean
  lastSeen: string
}

interface UserPreferences {
  playlists: Record<string, PlaylistRecord>
  lockedPlaylists: Record<string, string>
  categories: string[]
  lastSync: string | null
  // Per-action rate-limit ledger: action name -> list of epoch-ms timestamps of attempts.
  // Used by /api/rate-limit to enforce a rolling per-user, per-hour cap in production.
  rateLimits?: Record<string, number[]>
  // Category name -> emoji. Persisted so emojis survive a localStorage cache clear and can
  // be restored on login (same as categories).
  categoryEmojis?: Record<string, string>
}

export type { PlaylistRecord, UserPreferences }
