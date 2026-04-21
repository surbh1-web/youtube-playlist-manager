import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences, sanitizeInput } from '@/lib/preferences'

interface LockPlaylistRequest {
  playlistId: string
  playlistName: string
  targetCategory: string
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

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

    // Read current preferences
    const preferences = await readPreferences()
    
    // Add to lockedPlaylists
    const lockedPlaylist = {
      playlistId: sanitizedPlaylistId,
      lockedCategory: sanitizedTargetCategory,
      lockedAt: new Date().toISOString(),
      playlistName: sanitizedPlaylistName
    }
    
    const updatedLockedPlaylists: Record<string, string> = { ...(preferences.lockedPlaylists || {}) }
    updatedLockedPlaylists[sanitizedPlaylistId] = JSON.stringify(lockedPlaylist)
    
    // Update playlist record to mark as locked
    const updatedPlaylists = {
      ...preferences.playlists,
      [sanitizedPlaylistId]: {
        ...(preferences.playlists[sanitizedPlaylistId] || {}),
        isLocked: true,
        lastSeen: new Date().toISOString()
      }
    }
    
    // Write updated preferences
    await writePreferences({
      ...preferences,
      playlists: updatedPlaylists,
      lockedPlaylists: updatedLockedPlaylists,
      lastSync: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      lockedPlaylist: {
        playlistId: sanitizedPlaylistId,
        lockedCategory: sanitizedTargetCategory,
        lockedAt: lockedPlaylist.lockedAt,
        playlistName: sanitizedPlaylistName
      }
    })

  } catch (error) {
    console.error('Lock playlist error:', error)
    return NextResponse.json(
      { error: 'Failed to lock playlist' },
      { status: 500 }
    )
  }
}
