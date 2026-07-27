import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences, sanitizeInput, getUserKey } from '@/lib/preferences'
import { UserPreferences } from '@/types/preferences'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Read current preferences (per-user)
    const preferences = await readPreferences(getUserKey(session.user.email))
    
    // Only return data relevant to authenticated user (no sensitive data exposure)
    const userPreferences = {
      playlists: preferences.playlists,
      categories: preferences.categories,
      categoryEmojis: preferences.categoryEmojis || {},
      lastSync: preferences.lastSync
      // Note: lockedPlaylists omitted for security
    }

    return NextResponse.json(userPreferences)
  } catch (error) {
    console.error('Error reading preferences:', error)
    return NextResponse.json(
      { error: 'Failed to read preferences' },
      { status: 500 }
    )
  }
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

    const body = await request.json()
    
    // Sanitize all input data
    const sanitizedData: Partial<UserPreferences> = {
      playlists: body.playlists ? 
        Object.fromEntries(
          Object.entries(body.playlists).map(([key, playlist]: [string, any]) => [
            key,
            {
              id: sanitizeInput(String(playlist.id || '')),
              title: sanitizeInput(String(playlist.title || '')),
              category: sanitizeInput(String(playlist.category || '')),
              isLocked: Boolean(playlist.isLocked),
              lastSeen: sanitizeInput(String(playlist.lastSeen || ''))
            }
          ])
        ) : {},
      categories: body.categories ? 
        body.categories.map((cat: any) => sanitizeInput(String(cat))) : [],
      lastSync: body.lastSync ? sanitizeInput(String(body.lastSync)) : null
    }

    // Validate data structure before writing
    if (!sanitizedData.playlists || !sanitizedData.categories) {
      return NextResponse.json(
        { error: 'Invalid data structure' },
        { status: 400 }
      )
    }

    // Read current preferences first (per-user)
    const currentPreferences = await readPreferences(userKey)
    
    // Merge with existing data, preserving lockedPlaylists (security)
    const updatedPreferences: UserPreferences = {
      ...currentPreferences,
      ...sanitizedData,
      lockedPlaylists: currentPreferences.lockedPlaylists // Never update locked playlists via API
    }

    // Write to the per-user file
    const success = await writePreferences(userKey, updatedPreferences)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to save preferences' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      message: 'Preferences updated successfully',
      preferences: {
        playlists: updatedPreferences.playlists,
        categories: updatedPreferences.categories,
        lastSync: updatedPreferences.lastSync
        // Note: lockedPlaylists omitted for security
      }
    })
  } catch (error) {
    console.error('Error updating preferences:', error)
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    )
  }
}
