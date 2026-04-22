import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences, sanitizeInput } from '@/lib/preferences'
import { authOptions } from '@/lib/auth'

interface LockPlaylistRequest {
  playlistId: string
  playlistName: string
  targetCategory: string
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== LOCK PLAYLIST API CALLED ===')
    
    // Verify user is authenticated
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body: LockPlaylistRequest = await request.json()
    console.log('Request body:', body)
    
    // Sanitize all inputs
    const sanitizedPlaylistId = sanitizeInput(body.playlistId)
    const sanitizedPlaylistName = sanitizeInput(body.playlistName)
    const sanitizedTargetCategory = sanitizeInput(body.targetCategory)
    
    console.log('Sanitized inputs:', {
      playlistId: sanitizedPlaylistId,
      playlistName: sanitizedPlaylistName,
      targetCategory: sanitizedTargetCategory
    })
    
    // Validate inputs
    if (!sanitizedPlaylistId || !sanitizedPlaylistName || !sanitizedTargetCategory) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    // Read current preferences from database
    const preferences = await readPreferences()
    console.log('Current preferences loaded')
    
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
    
    console.log('About to write to database:', {
      playlistsCount: Object.keys(updatedPlaylists).length,
      lockedPlaylistsCount: Object.keys(updatedLockedPlaylists).length,
      lockedPlaylistData
    })
    
    // Write updated preferences to database
    const writeSuccess = await writePreferences({
      ...preferences,
      playlists: updatedPlaylists,
      lockedPlaylists: updatedLockedPlaylists,
      lastSync: new Date().toISOString()
    })
    
    if (!writeSuccess) {
      console.error('Database write failed')
      return NextResponse.json(
        { error: 'Failed to save lock data to database' },
        { status: 500 }
      )
    }
    
    console.log('Database write successful')
    
    return NextResponse.json({
      success: true,
      message: 'Playlist locked and moved successfully',
      lockedPlaylist: lockedPlaylistData
    })
  } catch (error) {
    console.error('Lock playlist error:', error)
    return NextResponse.json(
      { error: 'Failed to lock playlist: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
}
