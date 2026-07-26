import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences, sanitizeInput, getUserKey } from '@/lib/preferences'
import { authOptions } from '@/lib/auth'

interface LockPlaylistRequest {
  playlistId: string
  playlistName: string
  targetCategory: string
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

    const body: LockPlaylistRequest = await request.json()

    // Sanitize all inputs
    const sanitizedPlaylistId = sanitizeInput(body.playlistId)
    const sanitizedPlaylistName = sanitizeInput(body.playlistName)
    const sanitizedTargetCategory = sanitizeInput(body.targetCategory)

    // Validate inputs
    if (!sanitizedPlaylistId || !sanitizedPlaylistName || !sanitizedTargetCategory) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    // Read current preferences (per-user)
    const preferences = await readPreferences(userKey)
    
    // Update playlist record to mark as locked and move to new category
    const updatedPlaylists = {
      ...preferences.playlists,
      [sanitizedPlaylistId]: {
        ...(preferences.playlists[sanitizedPlaylistId] || {}),
        category: sanitizedTargetCategory, // Update category
        isLocked: true,
        lastSeen: new Date().toISOString()
      }
    }
    
    // Add to locked playlists with exact structure for database
    const lockedPlaylistData = {
      playlist_id: sanitizedPlaylistId,
      playlist_name: sanitizedPlaylistName,
      locked_category: sanitizedTargetCategory,
      locked_at: new Date().toISOString()
    }
    
    const updatedLockedPlaylists: Record<string, string> = { ...(preferences.lockedPlaylists || {}) }
    updatedLockedPlaylists[sanitizedPlaylistId] = JSON.stringify(lockedPlaylistData)

    // Write updated preferences (per-user)
    const writeSuccess = await writePreferences(userKey, {
      ...preferences,
      playlists: updatedPlaylists,
      lockedPlaylists: updatedLockedPlaylists,
      lastSync: new Date().toISOString()
    })

    if (!writeSuccess) {
      return NextResponse.json(
        { error: 'Failed to save lock data' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Playlist locked and moved successfully',
      lockedPlaylist: lockedPlaylistData
    })
  } catch (error) {
    console.error('Lock playlist error:', error)
    return NextResponse.json(
      { error: 'Failed to lock playlist' },
      { status: 500 }
    )
  }
}
