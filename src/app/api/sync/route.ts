import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences } from '@/lib/preferences'
import { authOptions } from '@/lib/auth'

interface YouTubePlaylist {
  id: string
  snippet: {
    title: string
    description: string
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Fetch current playlists from YouTube API
    const playlistsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&maxResults=50&mine=true`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!playlistsResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch playlists from YouTube' },
        { status: 500 }
      )
    }

    const playlistsData = await playlistsResponse.json()
    const currentPlaylists: YouTubePlaylist[] = playlistsData.items || []

    // Read stored playlist records
    const storedPreferences = await readPreferences()
    const storedPlaylistIds = new Set(Object.keys(storedPreferences.playlists))
    const currentPlaylistIds = new Set(currentPlaylists.map(p => p.id))

    // Compare and categorize changes
    const newPlaylists = currentPlaylists.filter(p => !storedPlaylistIds.has(p.id))
    const deletedPlaylists = Array.from(storedPlaylistIds).filter(id => !currentPlaylistIds.has(id))
    
    const renamedPlaylists = currentPlaylists.filter(current => {
      const stored = storedPreferences.playlists[current.id]
      return stored && stored.title !== current.snippet.title
    })

    const unchangedCount = currentPlaylists.length - newPlaylists.length - renamedPlaylists.length

    // Update stored preferences with current playlist data
    const updatedPlaylists = { ...storedPreferences.playlists }
    
    // Add new playlists
    newPlaylists.forEach(playlist => {
      updatedPlaylists[playlist.id] = {
        id: playlist.id,
        title: playlist.snippet.title,
        category: 'Uncategorized', // Will be categorized later
        isLocked: false,
        lastSeen: new Date().toISOString()
      }
    })

    // Update renamed playlists
    const finalRenamedPlaylists = []
    for (const playlist of renamedPlaylists) {
      const stored = storedPreferences.playlists[playlist.id]
      if (stored) {
        try {
          const response = await fetch(`${request.nextUrl.origin}/api/check-rename`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              playlistId: playlist.id,
              oldTitle: stored.title,
              newTitle: playlist.snippet.title
            })
          })
          
          if (response.ok) {
            const result = await response.json()
            if (result.recategorize) {
              // Add to renamed playlists for recategorization
              finalRenamedPlaylists.push(playlist)
            }
            // Always update the stored title
            if (updatedPlaylists[playlist.id]) {
              updatedPlaylists[playlist.id].title = playlist.snippet.title
              updatedPlaylists[playlist.id].lastSeen = new Date().toISOString()
            }
          }
        } catch (error) {
          console.warn(`Failed to check rename for playlist ${playlist.id}:`, error)
          // Fallback: update title anyway
          if (updatedPlaylists[playlist.id]) {
            updatedPlaylists[playlist.id].title = playlist.snippet.title
            updatedPlaylists[playlist.id].lastSeen = new Date().toISOString()
          }
        }
      }
    }

    // Remove deleted playlists
    let cleanupResult = null
    if (deletedPlaylists.length > 0) {
      try {
        const cleanupResponse = await fetch(`${request.nextUrl.origin}/api/cleanup-deleted`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            deletedPlaylistIds: deletedPlaylists
          })
        })
        
        if (cleanupResponse.ok) {
          cleanupResult = await cleanupResponse.json()
        }
      } catch (error) {
        console.warn('Cleanup failed:', error)
      }
    }

    // Update preferences
    const updatedPreferences = {
      ...storedPreferences,
      playlists: updatedPlaylists,
      lastSync: new Date().toISOString()
    }

    await writePreferences(updatedPreferences)

    return NextResponse.json({
      newPlaylists: newPlaylists.map(p => ({
        id: p.id,
        title: p.snippet.title
      })),
      deletedPlaylists,
      renamedPlaylists: finalRenamedPlaylists.map(p => ({
        id: p.id,
        oldTitle: storedPreferences.playlists[p.id]?.title,
        newTitle: p.snippet.title
      })),
      unchangedCount,
      lastSync: updatedPreferences.lastSync,
      cleanupStatus: cleanupResult
    })

  } catch (error) {
    console.error('Error during sync:', error)
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    )
  }
}
