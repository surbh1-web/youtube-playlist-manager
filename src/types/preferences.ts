interface PlaylistRecord {
  id: string
  title: string
  category: string
  isLocked: boolean
  lastSeen: string
}

interface UserPreferences {
  playlists: Record<string, PlaylistRecord>
  lockedPlaylists: Record<string, string>
  categories: string[]
  lastSync: string | null
}

export type { PlaylistRecord, UserPreferences }
