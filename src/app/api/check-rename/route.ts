import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences, sanitizeInput, getUserKey } from '@/lib/preferences'
import { getEmbedding, cosineSimilarity, isWordSuperset } from '@/lib/embeddings'
import { authOptions } from '@/lib/auth'

interface RenameRequest {
  playlistId: string
  oldTitle: string
  newTitle: string
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

    const body: RenameRequest = await request.json()
    
    if (!body.playlistId || !body.oldTitle || !body.newTitle) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    // Sanitize input
    const sanitizedOldTitle = sanitizeInput(body.oldTitle)
    const sanitizedNewTitle = sanitizeInput(body.newTitle)

    // Check if playlist is locked (per-user)
    const preferences = await readPreferences(userKey)
    const playlist = preferences.playlists[body.playlistId]
    
    if (playlist && playlist.isLocked) {
      return NextResponse.json({
        decision: 'locked',
        recategorize: false
      })
    }

    // Generate embeddings for both titles
    const [oldEmbedding, newEmbedding] = await Promise.all([
      getEmbedding(sanitizedOldTitle),
      getEmbedding(sanitizedNewTitle)
    ])

    // Calculate cosine similarity
    const similarity = cosineSimilarity(oldEmbedding, newEmbedding)

    // Validate similarity score
    if (typeof similarity !== 'number' || similarity < 0 || similarity > 1) {
      return NextResponse.json(
        { error: 'Invalid similarity calculation' },
        { status: 500 }
      )
    }

    // Apply exact logic
    let decision: string
    let recategorize: boolean

    if (similarity >= 0.75) {
      decision = 'no_change'
      recategorize = false
    } else if (similarity >= 0.70 && similarity < 0.75) {
      // Grey zone - check if new title is just a superset of old words
      if (isWordSuperset(sanitizedNewTitle, sanitizedOldTitle)) {
        decision = 'no_change'
        recategorize = false
      } else {
        decision = 'recategorize'
        recategorize = true
      }
    } else {
      // similarity < 0.70
      decision = 'recategorize'
      recategorize = true
    }

    // Update stored title if no recategorization needed
    if (!recategorize && playlist) {
      const updatedPlaylists = {
        ...preferences.playlists,
        [body.playlistId]: {
          ...playlist,
          title: sanitizedNewTitle,
          lastSeen: new Date().toISOString()
        }
      }
      
      await writePreferences(userKey, {
        ...preferences,
        playlists: updatedPlaylists,
        lastSync: new Date().toISOString()
      })
    }

    return NextResponse.json({
      decision,
      recategorize,
      similarity: Math.round(similarity * 100) / 100 // Round to 2 decimal places
    })

  } catch (error) {
    console.error('Rename check error:', error)
    return NextResponse.json(
      { error: 'Rename check failed' },
      { status: 500 }
    )
  }
}
