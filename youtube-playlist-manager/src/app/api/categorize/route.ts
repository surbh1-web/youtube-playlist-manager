import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

interface PlaylistForCategorization {
  id: string
  title: string
  description: string
  videoTitles?: string[]
}

interface CategorizedPlaylist {
  id: string
  category: string
}

// Helper function to categorize a single batch of playlists
async function categorizeBatch(
  batch: PlaylistForCategorization[], 
  batchNumber: number, 
  totalBatches: number
): Promise<Record<string, string>> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  // Prepare playlist data for AI with video titles
  const playlistData = batch.map((p, index) => {
    const videoContext = p.videoTitles && p.videoTitles.length > 0 
      ? `\n   Sample videos: ${p.videoTitles.slice(0, 3).join(", ")}`
      : '\n   Description: (none)'
    
    return `${index + 1}. ID: ${p.id}\n   Title: "${p.title}"${p.description ? `\n   Description: "${p.description}"` : ''}${videoContext}`
  }).join('\n\n')

  const systemPrompt = `You are a playlist categorizer. Given a playlist name and sample video titles, assign it to ONE of these categories: Food & Cooking, Fashion & Beauty, Fitness & Health, Kids Education, Technology & Learning, Dance, Music, Travel, Entertainment. You MUST pick one of these 10 categories. Never use General or Other. If unsure, pick the closest match based on video titles.

For each playlist, return only the category name.

Here are the playlists to categorize:
${playlistData}

Return JSON format: {"playlist_id": "category"}`

  console.log(`📤 Batch ${batchNumber}/${totalBatches} - Sending ${batch.length} playlists to OpenAI`)
  console.log("📝 Playlist data length:", playlistData.length)
  console.log("📝 First playlist sample:", playlistData.substring(0, 300))

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt
      }
    ],
    temperature: 0.1, // Lower temperature for more consistent results
    max_tokens: 2000,
  })

  const responseContent = completion.choices[0]?.message?.content
  
  if (!responseContent) {
    throw new Error("No response from OpenAI")
  }

  console.log(`📤 Batch ${batchNumber} - Raw OpenAI response (first 300 chars):`, responseContent.substring(0, 300))

  // Parse the JSON response
  let categorizedPlaylists: Record<string, string>
  
  try {
    // Clean up the response and parse JSON
    let cleanResponse = responseContent.trim()
    
    // Remove any markdown code blocks more robustly
    cleanResponse = cleanResponse.replace(/```json\s*\n?/g, '').replace(/```\s*\n?/g, '')
    
    // Try to find JSON object in the response
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      cleanResponse = jsonMatch[0]
    }
    
    categorizedPlaylists = JSON.parse(cleanResponse)
    console.log(`✅ Batch ${batchNumber} - Successfully parsed ${Object.keys(categorizedPlaylists).length} playlists`)
    
  } catch (parseError) {
    console.error(`❌ Batch ${batchNumber} - Failed to parse OpenAI response`)
    console.error("📄 Raw response (first 500 chars):", responseContent.substring(0, 500))
    console.error("🔧 Parse error details:", parseError)
    throw new Error(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`)
  }

  return categorizedPlaylists
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playlists }: { playlists: PlaylistForCategorization[] } = body

    if (!playlists || !Array.isArray(playlists)) {
      return NextResponse.json(
        { error: "Invalid request: playlists array is required" },
        { status: 400 }
      )
    }

    console.log("🎯 Starting categorization for", playlists.length, "playlists")
    console.log("📝 Sample playlist data:", playlists.slice(0, 3).map(p => ({ id: p.id, title: p.title, description: p.description?.substring(0, 100) + "..." })))

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Fetch video titles for better categorization context
    console.log("🔄 Fetching video titles for all playlists...")
    const playlistsWithContext = await Promise.all(
      playlists.map(async (playlist) => { // Process ALL playlists, not just 20
        try {
          const videoResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/youtube/videos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ playlistId: playlist.id })
          })

          if (videoResponse.ok) {
            const videoData = await videoResponse.json()
            return {
              ...playlist,
              videoTitles: videoData.videoTitles || []
            }
          } else {
            return playlist // Return original playlist if video fetch fails
          }
        } catch (error) {
          console.warn(`Failed to fetch videos for playlist ${playlist.id}:`, error)
          return playlist // Return original playlist if video fetch fails
        }
      })
    )

    console.log("✅ Video titles fetched for", playlistsWithContext.length, "playlists")

    // Process playlists in batches to handle OpenAI token limits
    const BATCH_SIZE = 15
    const totalBatches = Math.ceil(playlistsWithContext.length / BATCH_SIZE)
    console.log(`📦 Processing ${playlistsWithContext.length} playlists in ${totalBatches} batches of ${BATCH_SIZE}`)
    
    let allCategorizedPlaylists: Record<string, string> = {}
    let processedCount = 0

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * BATCH_SIZE
      const endIndex = Math.min(startIndex + BATCH_SIZE, playlistsWithContext.length)
      const batch = playlistsWithContext.slice(startIndex, endIndex)
      
      console.log(`🔄 Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} playlists)`)
      
      try {
        const batchResults = await categorizeBatch(batch, batchIndex + 1, totalBatches)
        
        // Merge batch results
        Object.assign(allCategorizedPlaylists, batchResults)
        processedCount += batch.length
        
        console.log(`✅ Batch ${batchIndex + 1} complete. Processed ${processedCount}/${playlistsWithContext.length} playlists`)
        
        // Add a small delay between batches to avoid rate limiting
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
        
      } catch (error) {
        console.error(`❌ Batch ${batchIndex + 1} failed:`, error)
        // Continue with next batch even if one fails
      }
    }

    console.log(`🎉 All batches complete! Categorized ${Object.keys(allCategorizedPlaylists).length} playlists`)

    // Log final category distribution
    const categoryCount: Record<string, number> = {}
    Object.values(allCategorizedPlaylists).forEach(category => {
      categoryCount[category] = (categoryCount[category] || 0) + 1
    })
    console.log("📊 Final category distribution:", categoryCount)

    // Validate the response using batch results
    const result: CategorizedPlaylist[] = []
    for (const playlist of playlists) {
      const category = allCategorizedPlaylists[playlist.id]
      if (!category) {
        console.warn("⚠️ No category found for playlist:", playlist.id, playlist.title)
        // Don't default to "General" - let the frontend handle missing categories
      } else {
        result.push({ id: playlist.id, category: category.trim() })
      }
    }

    // Group playlists by category for easier frontend processing
    const groupedByCategory: Record<string, CategorizedPlaylist[]> = {}
    result.forEach(item => {
      if (!groupedByCategory[item.category]) {
        groupedByCategory[item.category] = []
      }
      groupedByCategory[item.category].push(item)
    })

    console.log("🎉 Final categorization complete!")
    console.log("📂 Categories created:", Object.keys(groupedByCategory).sort())

    return NextResponse.json({
      categorizedPlaylists: result,
      groupedByCategory,
      categories: Object.keys(groupedByCategory).sort()
    })

  } catch (error) {
    console.error("💥 Error in categorization API:", error)
    
    // Check for OpenAI API errors
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        console.error("🔑 OpenAI API key error")
        return NextResponse.json(
          { error: "Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable." },
          { status: 401 }
        )
      }
      if (error.message.includes("quota") || error.message.includes("rate limit")) {
        console.error("💸 OpenAI quota exceeded")
        return NextResponse.json(
          { error: "OpenAI API quota exceeded. Please check your billing." },
          { status: 429 }
        )
      }
    }

    return NextResponse.json(
      { error: "Failed to categorize playlists. Please try again." },
      { status: 500 }
    )
  }
}
