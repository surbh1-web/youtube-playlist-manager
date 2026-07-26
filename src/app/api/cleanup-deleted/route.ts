import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences, sanitizeInput, getUserKey } from '@/lib/preferences'
import { authOptions } from '@/lib/auth'

interface CleanupRequest {
  deletedPlaylistIds: string[]
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    const userKey = getUserKey(session.user.email)

    const body: CleanupRequest = await request.json()
    
    // Validate request
    if (!body.deletedPlaylistIds || !Array.isArray(body.deletedPlaylistIds)) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    // Sanitize playlist IDs
    const sanitizedDeletedIds = body.deletedPlaylistIds.map(id => sanitizeInput(id))

    // Read current preferences (per-user)
    const preferences = await readPreferences(userKey)
    
    // Remove from playlists record
    const updatedPlaylists = { ...preferences.playlists }
    const removedPlaylists: string[] = []
    
    for (const playlistId of sanitizedDeletedIds) {
      if (updatedPlaylists[playlistId]) {
        delete updatedPlaylists[playlistId]
        removedPlaylists.push(playlistId)
      }
    }

    // Remove from lockedPlaylists record if present
    const updatedLockedPlaylists: Record<string, string> = { ...(preferences.lockedPlaylists || {}) }
    for (const playlistId of sanitizedDeletedIds) {
      if (updatedLockedPlaylists[playlistId]) {
        delete updatedLockedPlaylists[playlistId]
      }
    }

    // Write updated preferences (per-user)
    await writePreferences(userKey, {
      ...preferences,
      playlists: updatedPlaylists,
      lockedPlaylists: updatedLockedPlaylists,
      lastSync: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      removedPlaylists
    })

  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    )
  }
}
