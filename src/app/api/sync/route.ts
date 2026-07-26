import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences, getUserKey } from '@/lib/preferences'
import { authOptions, getAccessToken } from '@/lib/auth'

interface YouTubePlaylist {
  id: string
  snippet: {
    title: string
    description: string
    channelTitle?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getServerSession(authOptions)
    const accessToken = await getAccessToken(request)
    if (!session?.user?.email || !accessToken) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    const userKey = getUserKey(session.user.email)
    const cookieHeader = request.headers.get('cookie') ?? ''

    // Fetch ALL current playlists from YouTube (paginated) and filter out auto-generated
    // ones. This MUST match /api/youtube/playlists — otherwise a new playlist beyond the
    // first 50 (or in a later page) is never detected as "new" and incremental sync misses
    // it, even though a full rebuild would find it.
    const currentPlaylists: YouTubePlaylist[] = []
    let pageToken: string | null = null
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlists')
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('maxResults', '50')
      url.searchParams.set('mine', 'true')
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const resp = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      })
      if (!resp.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch playlists from YouTube' },
          { status: 500 }
        )
      }
      const data = await resp.json()
      const items: YouTubePlaylist[] = data.items || []
      for (const pl of items) {
        const id = pl.id || ''
        const title = pl.snippet?.title || ''
        const channelTitle = pl.snippet?.channelTitle || ''
        if (id.startsWith('WL') || id.startsWith('LL') || id.startsWith('RD')) continue
        if (!title.trim()) continue
        if (title === channelTitle) continue
        currentPlaylists.push(pl)
      }
      pageToken = data.nextPageToken || null
    } while (pageToken)

    // Read stored playlist records (per-user)
    const storedPreferences = await readPreferences(userKey)
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
              'Content-Type': 'application/json',
              'Cookie': cookieHeader
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
            'Content-Type': 'application/json',
            'Cookie': cookieHeader
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

    await writePreferences(userKey, updatedPreferences)

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
