import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { readPreferences, writePreferences, sanitizeInput } from '@/lib/preferences'
import { authOptions } from '@/lib/auth'

interface Playlist {
  id: string
  name: string
  description: string
}

interface CategorizeRequest {
  playlists: Playlist[]
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

    const body: CategorizeRequest = await request.json()
    
    if (!body.playlists || !Array.isArray(body.playlists)) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    // Read existing categories
    const preferences = await readPreferences()
    const existingCategories = preferences.categories || []

    // Process playlists in batches of 10
    const categorizedPlaylists: { playlist: Playlist; category: string; isNew: boolean }[] = []

    for (let i = 0; i < body.playlists.length; i += 10) {
      const batch = body.playlists.slice(i, i + 10)
      
      for (const playlist of batch) {
        try {
          // Fetch first 5 video titles for context
          const videosResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=5&playlistId=${playlist.id}`,
            {
              headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          )

          let videoTitles: string[] = []
          if (videosResponse.ok) {
            const videosData = await videosResponse.json()
            videoTitles = videosData.items?.map((item: any) => 
              item.snippet?.title || ''
            ).filter(Boolean) || []
          }

          // Sanitize playlist data
          const sanitizedPlaylist = {
            name: sanitizeInput(playlist.name),
            description: sanitizeInput(playlist.description),
            videoTitles: videoTitles.map(title => sanitizeInput(title))
          }

          // Call OpenAI for categorization
          const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are a playlist categorizer. Given playlist information, assign it to ONE category and suggest a single relevant emoji for this category.

Existing categories: [${existingCategories.join(', ')}]

Rules:
- Prefer existing categories over creating new ones
- Only create a new category if playlist clearly does not fit any existing category
- Never use "General" or "Other" as a category
- Keep category names short and consistent (max 3 words)
- Avoid duplicates (e.g., do not create "Tech" if "Technology & Learning" exists)

Playlist name: ${sanitizedPlaylist.name}
Description: ${sanitizedPlaylist.description}
Sample video titles: [${sanitizedPlaylist.videoTitles.join(', ')}]

Respond with JSON only: {"category": "category name", "isNew": true/false, "emoji": "emoji"}`
                }
              ],
              max_tokens: 100,
              temperature: 0.3
            })
          })

          if (openaiResponse.ok) {
            const openaiData = await openaiResponse.json()
            const aiResult = JSON.parse(openaiData.choices[0].message.content)
            
            // Validate OpenAI response
            if (aiResult.category && typeof aiResult.category === 'string') {
              categorizedPlaylists.push({
                playlist,
                category: aiResult.category,
                isNew: aiResult.isNew || false
              })
              
              // Store emoji in localStorage if provided
              if (aiResult.emoji) {
                try {
                  const existingEmojis = localStorage.getItem('category-emojis')
                  const allEmojis = existingEmojis ? { ...JSON.parse(existingEmojis), [aiResult.category]: aiResult.emoji } : { [aiResult.category]: aiResult.emoji }
                  localStorage.setItem('category-emojis', JSON.stringify(allEmojis))
                  console.log(`Stored emoji "${aiResult.emoji}" for category "${aiResult.category}"`)
                } catch (e) {
                  console.error("Failed to store category emoji in localStorage:", e)
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to categorize playlist ${playlist.id}:`, error)
          // Fallback to Uncategorized
          categorizedPlaylists.push({
            playlist,
            category: 'Uncategorized',
            isNew: false
          })
        }
      }
    }

    // Update preferences with new categories and playlists
    const updatedCategories = [...new Set([...existingCategories, ...categorizedPlaylists.map(cp => cp.category)])]
    const updatedPlaylists = { ...preferences.playlists }

    categorizedPlaylists.forEach(({ playlist, category }) => {
      updatedPlaylists[playlist.id] = {
        id: playlist.id,
        title: playlist.name,
        category: category,
        isLocked: false,
        lastSeen: new Date().toISOString()
      }
    })

    await writePreferences({
      ...preferences,
      categories: updatedCategories,
      playlists: updatedPlaylists,
      lastSync: new Date().toISOString()
    })

    return NextResponse.json({
      categorizedPlaylists: categorizedPlaylists.map(({ playlist, category, isNew }) => ({
        id: playlist.id,
        name: playlist.name,
        category,
        isNew
      }))
    })

  } catch (error) {
    console.error('Categorization error:', error)
    return NextResponse.json(
      { error: 'Categorization failed' },
      { status: 500 }
    )
  }
}
